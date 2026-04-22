export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json(
    {
      success: true,
      data: {
        service: "sentinel-pro-api",
        status: "ok",
        timestamp: new Date().toISOString(),
      },
    },
    { status: 200 },
  );
}
