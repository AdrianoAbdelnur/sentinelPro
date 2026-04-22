interface HowenConfig {
  baseUrl: string;
  webBaseUrl: string;
  username: string;
  password: string;
  passwordIsMd5: boolean;
  timeoutMs: number;
  autoRefreshEnabled: boolean;
  autoRefreshIntervalMs: number;
  streamBaseUrl: string;
  sessionPersistPath: string;
}

function parseBoolean(input: string | undefined, defaultValue: boolean): boolean {
  if (!input) {
    return defaultValue;
  }

  return ["true", "1", "yes", "on"].includes(input.toLowerCase());
}

function parseNumber(input: string | undefined, defaultValue: number): number {
  if (!input) {
    return defaultValue;
  }

  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export function getHowenConfig(): HowenConfig {
  const baseUrlRaw = required("HOWEN_BASE_URL").replace(/\/+$/, "");
  const baseUrl = baseUrlRaw;
  const webBaseUrl = (() => {
    const explicit = process.env.HOWEN_WEB_BASE_URL?.trim();
    if (explicit) {
      return explicit.replace(/\/+$/, "");
    }
    return baseUrlRaw;
  })();
  const username = required("HOWEN_USERNAME");
  const password = required("HOWEN_PASSWORD");
  const passwordIsMd5 = parseBoolean(process.env.HOWEN_PASSWORD_IS_MD5, false);
  const timeoutMs = parseNumber(process.env.HOWEN_TIMEOUT_MS, 15000);
  const autoRefreshEnabled = parseBoolean(process.env.HOWEN_AUTO_REFRESH, true);
  const autoRefreshIntervalMinutes = parseNumber(
    process.env.HOWEN_AUTO_REFRESH_INTERVAL_MIN,
    25,
  );
  const autoRefreshIntervalMs = autoRefreshIntervalMinutes * 60 * 1000;
  const streamBaseUrl = (() => {
    if (process.env.HOWEN_STREAM_BASE_URL) {
      return process.env.HOWEN_STREAM_BASE_URL.replace(/\/+$/, "");
    }

    const parsed = new URL(baseUrlRaw);
    return `http://${parsed.hostname}:33122`;
  })();
  const sessionPersistPath =
    process.env.HOWEN_SESSION_PERSIST_PATH?.trim() || ".runtime/howen-session.json";

  return {
    baseUrl,
    webBaseUrl,
    username,
    password,
    passwordIsMd5,
    timeoutMs,
    autoRefreshEnabled,
    autoRefreshIntervalMs,
    streamBaseUrl,
    sessionPersistPath,
  };
}
