import {
  fail,
  fromError,
  ok,
  parsePositiveInt,
  requiredQuery,
} from "@/lib/http/api";
import { HowenService } from "@/lib/integrations/howen/service";

export const runtime = "nodejs";

const howenService = new HowenService();

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);

    const deviceID = requiredQuery(searchParams, "deviceId");
    const beginTime = requiredQuery(searchParams, "beginTime");
    const endTime = requiredQuery(searchParams, "endTime");

    if (!deviceID || !beginTime || !endTime) {
      return fail(
        "VALIDATION_ERROR",
        "deviceId, beginTime and endTime are required",
        400,
      );
    }

    const pageNum = parsePositiveInt(searchParams.get("page"), 1, 1, 5000);
    const pageCount = parsePositiveInt(searchParams.get("pageSize"), 50, 1, 1000);

    const data = await howenService.events({
      pageNum,
      pageCount,
      deviceID,
      beginTime,
      endTime,
      alarmType: searchParams.get("alarmType") ?? undefined,
    });

    return ok(data);
  } catch (error) {
    return fromError(error);
  }
}
