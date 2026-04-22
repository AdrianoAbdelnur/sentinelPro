import { ok, fromError } from "@/lib/http/api";
import { HowenService } from "@/lib/integrations/howen/service";

export const runtime = "nodejs";

const howenService = new HowenService();

export async function GET(): Promise<Response> {
  try {
    const data = await howenService.connectionStatus();
    return ok(data);
  } catch (error) {
    return fromError(error);
  }
}
