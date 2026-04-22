import { fail, fromError, ok, requiredQuery } from "@/lib/http/api";
import { HowenService } from "@/lib/integrations/howen/service";

export const runtime = "nodejs";

const howenService = new HowenService();
const VALID_WNUM = new Set(["1", "4", "6", "9", "16"]);

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = requiredQuery(searchParams, "deviceId");
    if (!deviceId) {
      return fail("VALIDATION_ERROR", "deviceId is required", 400);
    }

    const chs = requiredQuery(searchParams, "chs") ?? "1_2_3_4";
    const streamInput = searchParams.get("stream")?.trim() ?? "0";
    if (streamInput !== "0" && streamInput !== "1") {
      return fail("VALIDATION_ERROR", "stream must be 0 or 1", 400);
    }

    const wnumInput = searchParams.get("wnum")?.trim();
    if (wnumInput && !VALID_WNUM.has(wnumInput)) {
      return fail("VALIDATION_ERROR", "wnum must be one of 1,4,6,9,16", 400);
    }

    const panelInput = searchParams.get("panel")?.trim();
    if (panelInput && panelInput !== "0" && panelInput !== "1") {
      return fail("VALIDATION_ERROR", "panel must be 0 or 1", 400);
    }

    const bufferInput = searchParams.get("buffer")?.trim();
    const bufferMs = bufferInput ? Number.parseInt(bufferInput, 10) : undefined;
    if (
      typeof bufferMs === "number" &&
      (!Number.isFinite(bufferMs) || bufferMs < 0 || bufferMs > 30000)
    ) {
      return fail("VALIDATION_ERROR", "buffer must be an integer between 0 and 30000", 400);
    }

    const data = await howenService.realVideoPageUrl({
      deviceId,
      chs,
      stream: streamInput === "1" ? 1 : 0,
      wnum: wnumInput ? (Number.parseInt(wnumInput, 10) as 1 | 4 | 6 | 9 | 16) : undefined,
      panel: panelInput ? (Number.parseInt(panelInput, 10) as 0 | 1) : undefined,
      buffer: bufferMs,
    });

    return ok(data);
  } catch (error) {
    return fromError(error);
  }
}

