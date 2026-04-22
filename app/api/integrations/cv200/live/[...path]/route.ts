import { fail } from "@/lib/http/api";

export const runtime = "nodejs";

const DEFAULT_BASE_URL = "http://127.0.0.1:8888";

const getBaseUrl = (): string =>
  (process.env.CV200_STREAM_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const params = await context.params;
  const pathParts = params.path ?? [];
  if (pathParts.length === 0) {
    return fail("VALIDATION_ERROR", "path is required", 400);
  }

  const upstreamPath = pathParts.join("/");
  const { search } = new URL(request.url);
  const upstreamUrl = `${getBaseUrl()}/${upstreamPath}${search}`;

  const upstream = await fetch(upstreamUrl, {
    method: "GET",
    cache: "no-store",
  });

  if (!upstream.ok) {
    const body = await upstream.text();
    return Response.json(
      {
        success: false,
        error: {
          code: "CV200_STREAM_ERROR",
          message: body || `CV200 stream HTTP ${upstream.status}`,
        },
      },
      { status: 502 },
    );
  }

  if (!upstream.body) {
    return Response.json(
      {
        success: false,
        error: {
          code: "CV200_STREAM_ERROR",
          message: "Upstream stream has no body",
        },
      },
      { status: 502 },
    );
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  const cacheControl = upstream.headers.get("cache-control");

  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  headers.set("Cache-Control", cacheControl ?? "no-store, no-cache, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Accel-Buffering", "no");

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}
