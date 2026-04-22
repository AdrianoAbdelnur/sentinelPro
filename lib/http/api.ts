import { IntegrationConfigError, HowenApiError } from "@/lib/integrations/howen/errors";

type ApiSuccess = {
  success: true;
  data: unknown;
  meta?: Record<string, unknown>;
};

type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    providerCode?: number;
  };
};

export function ok(data: unknown, meta?: Record<string, unknown>): Response {
  const payload: ApiSuccess = {
    success: true,
    data,
    ...(meta ? { meta } : {}),
  };

  return Response.json(payload, { status: 200 });
}

export function fail(code: string, message: string, status = 400): Response {
  const payload: ApiError = {
    success: false,
    error: { code, message },
  };

  return Response.json(payload, { status });
}

export function fromError(error: unknown): Response {
  if (error instanceof IntegrationConfigError) {
    return fail("INTEGRATION_CONFIG_ERROR", error.message, 500);
  }

  if (error instanceof HowenApiError) {
    return Response.json(
      {
        success: false,
        error: {
          code: "HOWEN_API_ERROR",
          message: error.message,
          providerCode: error.providerCode,
        },
      } satisfies ApiError,
      { status: 502 },
    );
  }

  return fail("INTERNAL_ERROR", "Unexpected server error", 500);
}

export function parsePositiveInt(
  input: string | null,
  defaultValue: number,
  min = 1,
  max = 1000,
): number {
  if (!input) {
    return defaultValue;
  }

  const n = Number.parseInt(input, 10);
  if (!Number.isFinite(n)) {
    return defaultValue;
  }

  return Math.min(Math.max(n, min), max);
}

export function requiredQuery(searchParams: URLSearchParams, key: string): string | null {
  const value = searchParams.get(key)?.trim();
  return value ? value : null;
}
