import { fail, fromError, requiredQuery } from "@/lib/http/api";

export const runtime = "nodejs";

const mediaMtxApiBaseUrl = (): string =>
  (process.env.CV200_MEDIAMTX_API_BASE_URL ?? "http://127.0.0.1:9997").replace(/\/+$/, "");

const resolveCv200Path = (deviceId: string): string => {
  if (deviceId.toUpperCase() === "CV200") {
    return "live/cv200-1";
  }
  return `live/${deviceId}-1`;
};

const toBool = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
};

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = requiredQuery(searchParams, "deviceId");
    if (!deviceId) {
      return fail("VALIDATION_ERROR", "deviceId is required", 400);
    }

    const path = resolveCv200Path(deviceId);
    const upstream = await fetch(`${mediaMtxApiBaseUrl()}/v3/paths/list`, { cache: "no-store" });
    if (!upstream.ok) {
      return fail("CV200_STREAM_STATUS_ERROR", `MediaMTX API HTTP ${upstream.status}`, 502);
    }

    const payload = (await upstream.json()) as {
      items?: Array<Record<string, unknown>>;
      data?: Array<Record<string, unknown>>;
    };

    const items = payload.items ?? payload.data ?? [];
    const match = items.find((item) => String(item.name ?? "") === path);
    const active = Boolean(
      match &&
        (toBool(match.ready) ||
          toBool(match.sourceReady) ||
          toBool(match.publisherReady) ||
          (Array.isArray(match.tracks) && match.tracks.length > 0))
    );

    return Response.json({
      success: true,
      data: {
        source: "cv200",
        deviceId,
        path,
        active,
      },
    });
  } catch (error) {
    return fromError(error);
  }
}
