import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getHowenConfig } from "@/lib/integrations/howen/config";
import { IntegrationConfigError, HowenApiError } from "@/lib/integrations/howen/errors";
import { howenLogger } from "@/lib/integrations/howen/logger";
import type {
  HowenAlarmRecord,
  HowenAlarmsParams,
  HowenApiResponse,
  HowenEvidenceRecord,
  HowenEvidenceSearchParams,
  HowenDeviceStatusRecord,
  HowenDeviceRecord,
  HowenDevicesParams,
  HowenPagedResult,
  HowenSessionData,
  HowenVideoSearchParams,
  HowenVideoSearchResult,
} from "@/lib/integrations/howen/types";

const SUCCESS_CODE = 10000;
const SESSION_DURATION_MS = 25 * 60 * 1000;

interface HowenSessionCache {
  token: string;
  pid: string;
  cookie: string | null;
  expiresAtMs: number;
}

let sessionCache: HowenSessionCache | null = null;
let loginInFlight: Promise<HowenSessionData> | null = null;
let sessionHydrationInFlight: Promise<void> | null = null;

declare global {
  var __howenAutoRefreshInterval: ReturnType<typeof setInterval> | undefined;
}

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

function parseCookie(setCookieHeaders: string[]): string | null {
  for (const setCookie of setCookieHeaders) {
    const jsession = setCookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("JSESSIONID="));
    if (jsession) {
      return jsession;
    }
  }
  return null;
}

function getSetCookieArray(response: Response): string[] {
  const responseWithRaw = response.headers as Headers & {
    raw?: () => Record<string, string[]>;
    getSetCookie?: () => string[];
  };

  if (typeof responseWithRaw.getSetCookie === "function") {
    return responseWithRaw.getSetCookie();
  }

  if (typeof responseWithRaw.raw === "function") {
    const raw = responseWithRaw.raw();
    return raw["set-cookie"] ?? [];
  }

  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

async function readHowenResponse<T>(response: Response): Promise<HowenApiResponse<T>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HowenApiError("Howen response is not valid JSON", 10003);
  }

  if (!payload || typeof payload !== "object") {
    throw new HowenApiError("Howen response has invalid format", 10003);
  }

  const casted = payload as Partial<HowenApiResponse<T>>;
  if (typeof casted.status !== "number") {
    throw new HowenApiError("Howen response missing status code", 10003);
  }

  if (casted.status !== SUCCESS_CODE) {
    howenLogger.warn("Howen business error", {
      status: casted.status,
      msg: casted.msg,
    });
    throw new HowenApiError(casted.msg ?? "Howen request failed", casted.status);
  }

  return casted as HowenApiResponse<T>;
}

export class HowenClient {
  private readonly config = getHowenConfig();
  private readonly sessionPersistFile = path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    this.config.sessionPersistPath,
  );

  private isSessionNearExpiry(bufferMs = 5 * 60 * 1000): boolean {
    return sessionCache !== null && Date.now() >= sessionCache.expiresAtMs - bufferMs;
  }

  private async hydrateSessionFromDisk(): Promise<void> {
    if (sessionCache) {
      return;
    }

    try {
      const raw = await readFile(this.sessionPersistFile, "utf-8");
      const parsed = JSON.parse(raw) as Partial<HowenSessionCache>;
      if (!parsed || typeof parsed !== "object") {
        return;
      }

      if (
        typeof parsed.token !== "string" ||
        typeof parsed.pid !== "string" ||
        typeof parsed.expiresAtMs !== "number"
      ) {
        return;
      }

      if (Date.now() >= parsed.expiresAtMs) {
        return;
      }

      sessionCache = {
        token: parsed.token,
        pid: parsed.pid,
        cookie: typeof parsed.cookie === "string" ? parsed.cookie : null,
        expiresAtMs: parsed.expiresAtMs,
      };

      howenLogger.info("Hydrated Howen session from disk", {
        token: howenLogger.secure(sessionCache.token),
        pid: howenLogger.secure(sessionCache.pid),
        hasCookie: Boolean(sessionCache.cookie),
        expiresAt: new Date(sessionCache.expiresAtMs).toISOString(),
        file: this.sessionPersistFile,
      });
    } catch {
      // Ignore when file does not exist or cannot be parsed.
    }
  }

  private async persistSessionToDisk(): Promise<void> {
    if (!sessionCache) {
      return;
    }

    const dir = path.dirname(this.sessionPersistFile);
    await mkdir(dir, { recursive: true });
    await writeFile(this.sessionPersistFile, JSON.stringify(sessionCache, null, 2), "utf-8");
  }

  private ensureAutoRefreshLoop() {
    if (!this.config.autoRefreshEnabled) {
      return;
    }

    if (globalThis.__howenAutoRefreshInterval) {
      return;
    }

    globalThis.__howenAutoRefreshInterval = setInterval(() => {
      void this.refreshSessionInBackground();
    }, this.config.autoRefreshIntervalMs);

    if (typeof globalThis.__howenAutoRefreshInterval.unref === "function") {
      globalThis.__howenAutoRefreshInterval.unref();
    }

    howenLogger.info("Howen token auto-refresh enabled", {
      intervalMs: this.config.autoRefreshIntervalMs,
    });
  }

  private async refreshSessionInBackground(): Promise<void> {
    try {
      if (!sessionCache) {
        await this.connect();
        return;
      }

      if (!this.isSessionNearExpiry()) {
        howenLogger.info("Skipping scheduled token refresh, session still healthy", {
          expiresAt: new Date(sessionCache.expiresAtMs).toISOString(),
        });
        return;
      }

      howenLogger.info("Starting scheduled token refresh");
      sessionCache = null;
      await this.connect();
      howenLogger.info("Scheduled token refresh success");
    } catch (error) {
      howenLogger.error("Scheduled token refresh failed", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private get normalizedPassword(): string {
    return this.config.passwordIsMd5 ? this.config.password : md5(this.config.password);
  }

  private get hasValidSession(): boolean {
    return sessionCache !== null && Date.now() < sessionCache.expiresAtMs;
  }

  async connect(): Promise<HowenSessionData> {
    this.ensureAutoRefreshLoop();

    if (!sessionCache) {
      if (!sessionHydrationInFlight) {
        sessionHydrationInFlight = this.hydrateSessionFromDisk().finally(() => {
          sessionHydrationInFlight = null;
        });
      }
      await sessionHydrationInFlight;
    }

    if (this.hasValidSession && sessionCache) {
      howenLogger.info("Using cached session", {
        token: howenLogger.secure(sessionCache.token),
        pid: howenLogger.secure(sessionCache.pid),
        hasCookie: Boolean(sessionCache.cookie),
        expiresAt: new Date(sessionCache.expiresAtMs).toISOString(),
      });
      return { token: sessionCache.token, pid: sessionCache.pid };
    }

    if (loginInFlight) {
      return loginInFlight;
    }

    loginInFlight = this.login();
    try {
      return await loginInFlight;
    } finally {
      loginInFlight = null;
    }
  }

  private async login(): Promise<HowenSessionData> {
    const url = `${this.config.baseUrl}/vss/user/apiLogin.action`;
    howenLogger.info("Starting Howen login", {
      url,
      username: this.config.username,
      passwordIsMd5: this.config.passwordIsMd5,
      timeoutMs: this.config.timeoutMs,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: this.config.username,
        password: this.normalizedPassword,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
      cache: "no-store",
    });

    if (!response.ok) {
      howenLogger.error("Howen login HTTP error", {
        status: response.status,
        statusText: response.statusText,
      });
      throw new HowenApiError(`Howen login HTTP error: ${response.status}`, response.status);
    }

    const parsed = await readHowenResponse<HowenSessionData>(response);
    const token = parsed.data?.token;
    const pid = parsed.data?.pid;

    if (!token || !pid) {
      howenLogger.error("Howen login missing token/pid", {
        response: parsed,
      });
      throw new IntegrationConfigError("Howen login succeeded but token/pid were not returned");
    }

    const cookie = parseCookie(getSetCookieArray(response));

    sessionCache = {
      token,
      pid,
      cookie,
      expiresAtMs: Date.now() + SESSION_DURATION_MS,
    };
    await this.persistSessionToDisk();

    howenLogger.info("Howen login success", {
      token: howenLogger.secure(token),
      pid: howenLogger.secure(pid),
      hasCookie: Boolean(cookie),
      cookie: cookie && howenLogger.isSensitiveEnabled() ? cookie : cookie ? "JSESSIONID=***" : null,
      expiresAt: new Date(sessionCache.expiresAtMs).toISOString(),
    });

    return parsed.data;
  }

  private async post<TData, TBody extends object>(path: string, body: TBody): Promise<TData> {
    const session = await this.connect();

    const url = `${this.config.baseUrl}${path}`;
    const startedAt = Date.now();
    howenLogger.info("Calling Howen endpoint", {
      path,
      url,
      token: howenLogger.secure(session.token),
      body,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionCache?.cookie ? { Cookie: sessionCache.cookie } : {}),
      },
      body: JSON.stringify({ token: session.token, ...body }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
      cache: "no-store",
    });

    if (!response.ok) {
      howenLogger.error("Howen endpoint HTTP error", {
        path,
        status: response.status,
        statusText: response.statusText,
      });
      throw new HowenApiError(`Howen HTTP error: ${response.status}`, response.status);
    }

    const parsed = await readHowenResponse<TData>(response);
    howenLogger.info("Howen endpoint success", {
      path,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return parsed.data;
  }

  async fetchDevices(params: HowenDevicesParams): Promise<HowenPagedResult<HowenDeviceRecord>> {
    return this.post<HowenPagedResult<HowenDeviceRecord>, HowenDevicesParams>(
      "/vss/vehicle/findAll.action",
      params,
    );
  }

  async fetchAlarms(params: HowenAlarmsParams): Promise<HowenPagedResult<HowenAlarmRecord>> {
    return this.post<HowenPagedResult<HowenAlarmRecord>, HowenAlarmsParams>(
      "/vss/alarm/apiFindAllByTime.action",
      params,
    );
  }

  async fetchRecordings(params: HowenVideoSearchParams): Promise<HowenVideoSearchResult> {
    return this.post<HowenVideoSearchResult, HowenVideoSearchParams>(
      "/vss/record/videoFileSearch.action",
      params,
    );
  }

  async fetchEvidence(params: HowenEvidenceSearchParams): Promise<HowenEvidenceRecord[]> {
    return this.post<HowenEvidenceRecord[], HowenEvidenceSearchParams>(
      "/vss/record/evidenceToRetrieve.action",
      params,
    );
  }

  async fetchDeviceStatus(params: {
    deviceID: string;
  }): Promise<HowenDeviceStatusRecord[]> {
    return this.post<HowenDeviceStatusRecord[], { deviceID: string }>(
      "/vss/vehicle/getDeviceStatus.action",
      params,
    );
  }

  async buildLiveStreamUrl(params: {
    deviceId: string;
    channel: number;
    stream: 0 | 1;
  }): Promise<string> {
    const session = await this.connect();
    const token = encodeURIComponent(session.token);
    const deviceId = encodeURIComponent(params.deviceId);
    const channel = encodeURIComponent(String(params.channel));
    const stream = encodeURIComponent(String(params.stream));
    return `${this.config.streamBaseUrl}/live?${token}_${deviceId}_${channel}_${stream}`;
  }
}
