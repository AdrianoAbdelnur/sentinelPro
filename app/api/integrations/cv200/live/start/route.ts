import { fail, fromError } from "@/lib/http/api";

export const runtime = "nodejs";

const ingestBaseUrl = (): string =>
  (process.env.CV200_INGEST_BASE_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");

const rtmpServer = (): string => process.env.CV200_RTMP_SERVER ?? "192.168.100.6:1935/live";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      deviceId?: string;
      channel?: number;
      streamingType?: 0 | 1 | 2 | 3;
      pushingTimeoutSec?: number;
      pushingAudio?: 0 | 1;
    };

    const deviceId = String(body.deviceId ?? "").trim();
    if (!deviceId) {
      return fail("VALIDATION_ERROR", "deviceId is required", 400);
    }

    const channel = Number.isFinite(body.channel) ? Math.max(1, Number(body.channel)) : 1;
    const payload = {
      deviceId,
      rtmpServer: rtmpServer(),
      encoderKey: `cv200-${channel}`,
      streamingType: body.streamingType ?? 0,
      channel,
      pushingAudio: body.pushingAudio ?? 0,
      pushingTimeoutSec: body.pushingTimeoutSec ?? 600,
    };

    const upstream = await fetch(`${ingestBaseUrl()}/live/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
