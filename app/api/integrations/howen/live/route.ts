import { fail, fromError, requiredQuery } from "@/lib/http/api";
import { howenLogger } from "@/lib/integrations/howen/logger";
import { HowenService } from "@/lib/integrations/howen/service";

export const runtime = "nodejs";

const howenService = new HowenService();

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = requiredQuery(searchParams, "deviceId");
    const channelInput = requiredQuery(searchParams, "channel") ?? "1";
    const streamInput = requiredQuery(searchParams, "stream") ?? "0";

    if (!deviceId) {
      return fail("VALIDATION_ERROR", "deviceId is required", 400);
    }

    const channel = Number.parseInt(channelInput, 10);
    if (!Number.isFinite(channel) || channel < 1 || channel > 32) {
      return fail("VALIDATION_ERROR", "channel must be between 1 and 32", 400);
    }

    if (streamInput !== "0" && streamInput !== "1") {
      return fail("VALIDATION_ERROR", "stream must be 0 or 1", 400);
    }

    const { url } = await howenService.liveStreamUrl({
      deviceId,
      channel,
      stream: streamInput === "1" ? 1 : 0,
    });
    const startedAt = Date.now();
    howenLogger.info("Opening live proxy stream", {
      deviceId,
      channel,
      stream: streamInput,
      upstreamUrl: url,
    });

    const upstream = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });
    howenLogger.info("Live upstream response", {
      deviceId,
      channel,
      stream: streamInput,
      status: upstream.status,
      contentType: upstream.headers.get("content-type"),
      durationMs: Date.now() - startedAt,
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      howenLogger.error("Live upstream not OK", {
        deviceId,
        channel,
        stream: streamInput,
        status: upstream.status,
        body,
      });
      return Response.json(
        {
          success: false,
          error: {
            code: "HOWEN_STREAM_ERROR",
            message: body || `Howen stream HTTP ${upstream.status}`,
          },
        },
        { status: 502 },
      );
    }

    if (!upstream.body) {
      howenLogger.error("Live upstream has no body", {
        deviceId,
        channel,
        stream: streamInput,
      });
      return Response.json(
        {
          success: false,
          error: {
            code: "HOWEN_STREAM_ERROR",
            message: "Upstream stream has no body",
          },
        },
        { status: 502 },
      );
    }

    const headers = new Headers();
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
    headers.set("Content-Type", "video/x-flv");
    headers.set("X-Accel-Buffering", "no");

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    howenLogger.error("Live proxy route failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return fromError(error);
  }
}
