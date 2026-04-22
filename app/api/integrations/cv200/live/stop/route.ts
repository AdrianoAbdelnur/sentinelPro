import { fail, fromError } from "@/lib/http/api";

export const runtime = "nodejs";

const ingestBaseUrl = (): string =>
  (process.env.CV200_INGEST_BASE_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { deviceId?: string };
    const deviceId = String(body.deviceId ?? "").trim();
    if (!deviceId) {
      return fail("VALIDATION_ERROR", "deviceId is required", 400);
    }

    const upstream = await fetch(`${ingestBaseUrl()}/live/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });

    const raw = await upstream.text();
    return new Response(raw, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return fromError(error);
  }
}
