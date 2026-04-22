import { fail, fromError, ok } from "@/lib/http/api";
import {
  AiInsightsValidationError,
  generateHowenAiInsights,
  parseHowenAiInsightsEvent,
} from "@/lib/integrations/howen/ai-insights";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("VALIDATION_ERROR", "Request body must be valid JSON", 400);
    }

    const event = parseHowenAiInsightsEvent(body);
    if (!event) {
      return fail(
        "VALIDATION_ERROR",
        "Request body must include an event object or raw_event object",
        400,
      );
    }

    const data = await generateHowenAiInsights(event);
    return ok(data);
  } catch (error) {
    if (error instanceof AiInsightsValidationError) {
      return fail("VALIDATION_ERROR", error.message, 400);
    }
    return fromError(error);
  }
}
