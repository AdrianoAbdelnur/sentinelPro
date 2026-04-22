import { fail, fromError, ok, parsePositiveInt } from "@/lib/http/api";
import { HowenService } from "@/lib/integrations/howen/service";

export const runtime = "nodejs";

const howenService = new HowenService();

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const loadAll = searchParams.get("all") === "1";
    const pageNum = loadAll
      ? -1
      : parsePositiveInt(searchParams.get("page"), 1, 1, 5000);
    const pageCount = loadAll
      ? -1
      : parsePositiveInt(searchParams.get("pageSize"), 50, 1, 1000);
    const isOnlineValue = searchParams.get("isOnline");
    const isOnline =
      isOnlineValue === "0" || isOnlineValue === "1"
        ? (isOnlineValue as "0" | "1")
        : undefined;

    if (isOnlineValue && !isOnline) {
      return fail("VALIDATION_ERROR", "isOnline must be 0 or 1", 400);
    }

    const data = await howenService.devices({
      pageNum,
      pageCount,
      isOnline,
      keyword: searchParams.get("keyword") ?? undefined,
      fleetid: searchParams.get("fleetId") ?? undefined,
    });

    return ok(data, { loadedAll: loadAll });
  } catch (error) {
    return fromError(error);
  }
}
