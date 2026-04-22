import { fail, fromError, ok, requiredQuery } from "@/lib/http/api";
import { HowenService } from "@/lib/integrations/howen/service";
import type { HowenVideoSearchParams } from "@/lib/integrations/howen/types";

export const runtime = "nodejs";

const VALID_FILE_TYPES: HowenVideoSearchParams["fileType"][] = ["1", "2", "3", "4"];
const VALID_LOCATIONS: HowenVideoSearchParams["location"][] = ["1", "2", "4", "5"];

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

    const fileTypeInput = searchParams.get("fileType")?.trim() ?? "1";
    if (!VALID_FILE_TYPES.includes(fileTypeInput as HowenVideoSearchParams["fileType"])) {
      return fail("VALIDATION_ERROR", "fileType must be one of 1,2,3,4", 400);
    }

    const locationInput = searchParams.get("location")?.trim() ?? "1";
    if (!VALID_LOCATIONS.includes(locationInput as HowenVideoSearchParams["location"])) {
      return fail("VALIDATION_ERROR", "location must be one of 1,2,4,5", 400);
    }

    const data = await howenService.overview({
      deviceID,
      beginTime,
      endTime,
      channelList: searchParams.get("channelList") ?? undefined,
      alarmType: searchParams.get("alarmType") ?? undefined,
      fileType: fileTypeInput as HowenVideoSearchParams["fileType"],
      location: locationInput as HowenVideoSearchParams["location"],
    });

    return ok(data);
  } catch (error) {
    return fromError(error);
  }
}
