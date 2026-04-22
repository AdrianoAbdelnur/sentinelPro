import { fail, fromError, requiredQuery } from "@/lib/http/api";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const streamPath = requiredQuery(searchParams, "path") ?? "live/cv200-1";
    const normalized = streamPath.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!normalized) {
      return fail("VALIDATION_ERROR", "path is required", 400);
    }

    return Response.json({
      success: true,
      data: {
        source: "cv200",
        path: normalized,
        hlsUrl: `/api/integrations/cv200/live/${normalized}/index.m3u8`,
      },
    });
  } catch (error) {
    return fromError(error);
  }
}
