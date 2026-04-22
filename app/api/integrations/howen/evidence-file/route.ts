import { fail } from "@/lib/http/api";
import { getHowenConfig } from "@/lib/integrations/howen/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAllowedHost(hostname: string): boolean {
  const config = getHowenConfig();
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(config.baseUrl).hostname);
  } catch {}
  try {
    hosts.add(new URL(config.webBaseUrl).hostname);
  } catch {}
  try {
    hosts.add(new URL(config.streamBaseUrl).hostname);
  } catch {}
  return hosts.has(hostname);
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const encoded = searchParams.get("url")?.trim();
  if (!encoded) {
    return fail("VALIDATION_ERROR", "url is required", 400);
  }

  let target: URL;
  try {
    target = new URL(encoded);
  } catch {
    return fail("VALIDATION_ERROR", "url is invalid", 400);
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return fail("VALIDATION_ERROR", "url protocol must be http/https", 400);
  }

  if (!isAllowedHost(target.hostname)) {
    return fail("VALIDATION_ERROR", "url host is not allowed", 403);
  }

  const upstream = await fetch(target.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return fail("UPSTREAM_ERROR", `Unable to fetch evidence file (${upstream.status})`, 502);
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "no-store");
  const contentDisposition = upstream.headers.get("content-disposition");
  if (contentDisposition) {
    headers.set("Content-Disposition", contentDisposition);
  }
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }
  const acceptRanges = upstream.headers.get("accept-ranges");
  if (acceptRanges) {
    headers.set("Accept-Ranges", acceptRanges);
  }

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}
