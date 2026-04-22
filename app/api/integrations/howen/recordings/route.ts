import { fail, fromError, ok, requiredQuery } from "@/lib/http/api";
import { HowenService } from "@/lib/integrations/howen/service";
import type { HowenVideoSearchParams } from "@/lib/integrations/howen/types";

export const runtime = "nodejs";

const VALID_FILE_TYPES: HowenVideoSearchParams["fileType"][] = ["1", "2", "3", "4"];
const VALID_LOCATIONS: HowenVideoSearchParams["location"][] = ["1", "2", "4", "5"];
const VALID_SCHEMES: NonNullable<HowenVideoSearchParams["scheme"]>[] = ["http", "https"];

const howenService = new HowenService();

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const deviceID = requiredQuery(searchParams, "deviceId");
    const startTime = requiredQuery(searchParams, "startTime");
    const endTime = requiredQuery(searchParams, "endTime");

    if (!deviceID || !startTime || !endTime) {
      return fail(
        "VALIDATION_ERROR",
        "deviceId, startTime and endTime are required",
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

    const schemeInput = searchParams.get("scheme")?.trim() as
      | HowenVideoSearchParams["scheme"]
      | undefined;
    if (schemeInput && !VALID_SCHEMES.includes(schemeInput)) {
      return fail("VALIDATION_ERROR", "scheme must be http or https", 400);
    }

    const data = await howenService.recordings({
      deviceID,
      startTime,
      endTime,
      channelList: searchParams.get("channelList") ?? undefined,
      fileType: fileTypeInput as HowenVideoSearchParams["fileType"],
      location: locationInput as HowenVideoSearchParams["location"],
      scheme: schemeInput,
    });

    return ok(data);
  } catch (error) {
    return fromError(error);
  }
}
