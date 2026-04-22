import { fail, fromError, ok, requiredQuery } from "@/lib/http/api";
import { HowenService } from "@/lib/integrations/howen/service";

export const runtime = "nodejs";

const howenService = new HowenService();

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const deviceID = requiredQuery(searchParams, "deviceId");
    if (!deviceID) {
      return fail("VALIDATION_ERROR", "deviceId is required", 400);
    }

    const data = await howenService.deviceStatus({ deviceID });
    return ok(data);
  } catch (error) {
    return fromError(error);
  }
}

