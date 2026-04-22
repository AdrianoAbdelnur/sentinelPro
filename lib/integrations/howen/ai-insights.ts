import { IntegrationConfigError } from "@/lib/integrations/howen/errors";

type JsonRecord = Record<string, unknown>;

type AnalyzerRequestBody = {
  event_id: string;
  event_type?: string;
  forensic_video_url: string;
  timestamp_utc?: string;
  metadata?: JsonRecord;
};

type AnalyzerResponseBody = {
  ok?: boolean;
  analysis?: unknown;
};

export type HowenAiInsightsResult = {
  source: "howen";
  raw_event: JsonRecord;
  ai_insights: JsonRecord;
};

export class AiInsightsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiInsightsValidationError";
  }
}

function parseNumber(input: string | undefined, defaultValue: number): number {
  if (!input) {
    return defaultValue;
  }

  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function getAiAnalyzerConfig(): { baseUrl: string; timeoutMs: number } {
  const baseUrl = process.env.AI_ANALYZER_URL?.trim()?.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new IntegrationConfigError("Missing required environment variable: AI_ANALYZER_URL");
  }

  const timeoutMs = parseNumber(process.env.AI_ANALYZER_TIMEOUT_MS, 20_000);
  return { baseUrl, timeoutMs };
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function readString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNestedString(record: JsonRecord, path: string[]): string | null {
  let cursor: unknown = record;
  for (const key of path) {
    const current = asRecord(cursor);
    if (!current) {
      return null;
    }
    cursor = current[key];
  }
  return typeof cursor === "string" && cursor.trim() ? cursor.trim() : null;
}

function inferEventId(event: JsonRecord): string {
  const eventId =
    readString(event, "event_id") ??
    readString(event, "alarmGuid") ??
    readString(event, "guid") ??
    readString(event, "id");

  if (eventId) {
    return eventId;
  }

  return `howen-${Date.now()}`;
}

function inferEventType(event: JsonRecord): string | undefined {
  return (
    readString(event, "event_type") ??
    readString(event, "alarmType") ??
    readString(event, "alarmvalue") ??
    undefined
  );
}

function inferTimestamp(event: JsonRecord): string | undefined {
  return (
    readString(event, "timestamp_utc") ??
    readString(event, "alarmTime") ??
    readString(event, "createtime") ??
    readString(event, "reportTime") ??
    undefined
  );
}

function extractForensicVideoUrl(event: JsonRecord): string {
  const candidates = [
    readNestedString(event, ["media", "forensic_video_url"]),
    readNestedString(event, ["media", "forensicVideoUrl"]),
    readString(event, "forensic_video_url"),
    readString(event, "forensicVideoUrl"),
    readString(event, "downUrl"),
  ];

  const first = candidates.find((value) => Boolean(value));
  if (!first) {
    throw new AiInsightsValidationError(
      "Could not resolve forensic video URL from event payload",
    );
  }
  return first;
}

function buildAnalyzerPayload(event: JsonRecord): AnalyzerRequestBody {
  const event_id = inferEventId(event);
  const event_type = inferEventType(event);
  const timestamp_utc = inferTimestamp(event);
  const forensic_video_url = extractForensicVideoUrl(event);

  const metadata: JsonRecord = {
    external_vehicle_id: readString(event, "external_vehicle_id") ?? readString(event, "deviceID"),
    external_vehicle_domain:
      readString(event, "external_vehicle_domain") ?? readString(event, "devicename"),
  };

  return {
    event_id,
    event_type,
    forensic_video_url,
    timestamp_utc,
    metadata,
  };
}

async function callAnalyzer(event: JsonRecord): Promise<JsonRecord> {
  const { baseUrl, timeoutMs } = getAiAnalyzerConfig();
  const payload = buildAnalyzerPayload(event);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/analyze-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    const parsed = (await response.json()) as AnalyzerResponseBody;
    if (!response.ok || !parsed.ok) {
      throw new Error("AI analyzer returned an error response");
    }

    const analysis = asRecord(parsed.analysis);
    if (!analysis) {
      throw new Error("AI analyzer response is missing analysis payload");
    }

    return analysis;
  } catch (error) {
    if (
      error instanceof IntegrationConfigError ||
      error instanceof AiInsightsValidationError
    ) {
      throw error;
    }
    throw new Error(`AI insights request failed: ${String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

export function parseHowenAiInsightsEvent(input: unknown): JsonRecord | null {
  const body = asRecord(input);
  if (!body) {
    return null;
  }

  const nestedEvent = asRecord(body.event);
  if (nestedEvent) {
    return nestedEvent;
  }

  const rawEvent = asRecord(body.raw_event);
  if (rawEvent) {
    return rawEvent;
  }

  return body;
}

export async function generateHowenAiInsights(event: JsonRecord): Promise<HowenAiInsightsResult> {
  const insights = await callAnalyzer(event);
  return {
    source: "howen",
    raw_event: event,
    ai_insights: insights,
  };
}
