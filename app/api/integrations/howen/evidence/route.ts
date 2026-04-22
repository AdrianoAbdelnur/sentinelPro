import { fail, fromError, ok, requiredQuery } from "@/lib/http/api";
import { HowenService } from "@/lib/integrations/howen/service";
import type { HowenEvidenceSearchParams } from "@/lib/integrations/howen/types";

export const runtime = "nodejs";

const VALID_SCHEMES: NonNullable<HowenEvidenceSearchParams["scheme"]>[] = ["http", "https"];

const howenService = new HowenService();

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const conditionName =
      requiredQuery(searchParams, "conditionName") ?? requiredQuery(searchParams, "deviceId");
    const startTime = requiredQuery(searchParams, "startTime");
    const endTime = requiredQuery(searchParams, "endTime");

    if (!conditionName || !startTime || !endTime) {
      return fail(
        "VALIDATION_ERROR",
        "conditionName (or deviceId), startTime and endTime are required",
        400,
      );
    }

    const schemeInput = searchParams.get("scheme")?.trim() as
      | HowenEvidenceSearchParams["scheme"]
      | undefined;
    if (schemeInput && !VALID_SCHEMES.includes(schemeInput)) {
      return fail("VALIDATION_ERROR", "scheme must be http or https", 400);
    }

    const data = await howenService.evidence({
      conditionName: conditionName.trim(),
      startTime,
      endTime,
      alarmType: searchParams.get("alarmType") ?? undefined,
      scheme: schemeInput,
    });

    return ok(data);
  } catch (error) {
    return fromError(error);
  }
}
