import { fail, fromError, ok, parsePositiveInt } from "@/lib/http/api";
import {
  fetchAllCv200Devices,
  fetchCv200DevicesPage,
  mapCv200ToHowenDeviceShape,
} from "@/lib/integrations/cv200/client";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const loadAll = searchParams.get("all") === "1";
    const pageNum = parsePositiveInt(searchParams.get("page"), 1, 1, 5000);
    const pageCount = parsePositiveInt(searchParams.get("pageSize"), 50, 1, 1000);
    const keyword = searchParams.get("keyword")?.trim() || undefined;
    const fleetId = searchParams.get("fleetId")?.trim() || undefined;
    const isOnlineValue = searchParams.get("isOnline");
    const isOnline =
      isOnlineValue === "0" || isOnlineValue === "1"
        ? (isOnlineValue as "0" | "1")
        : undefined;

    if (isOnlineValue && !isOnline) {
      return fail("VALIDATION_ERROR", "isOnline must be 0 or 1", 400);
    }

    if (loadAll) {
      const allDevices = await fetchAllCv200Devices({ isOnline, keyword, fleetId });
      const dataList = allDevices.map(mapCv200ToHowenDeviceShape);
      return ok(
        {
          totalCount: dataList.length,
          totalNum: dataList.length,
          pageNum: -1,
          pageCount: -1,
          fromCount: dataList.length > 0 ? 1 : 0,
          toCount: dataList.length,
          dataList,
        },
        { source: "cv200", loadedAll: true },
      );
    }

    const page = await fetchCv200DevicesPage({
      page: pageNum,
      pageSize: pageCount,
      isOnline,
      keyword,
      fleetId,
    });
    const dataList = page.data.map(mapCv200ToHowenDeviceShape);
    const fromCount = dataList.length > 0 ? (page.meta.page - 1) * page.meta.pageSize + 1 : 0;
    const toCount = dataList.length > 0 ? fromCount + dataList.length - 1 : 0;

    return ok(
      {
        totalCount: page.meta.total,
        totalNum: page.meta.total,
        pageNum: page.meta.page,
        pageCount: page.meta.pageSize,
        fromCount,
        toCount,
        dataList,
      },
      { source: "cv200", loadedAll: false },
    );
  } catch (error) {
    return fromError(error);
  }
}
