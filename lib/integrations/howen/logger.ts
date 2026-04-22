function asBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const DEBUG_ENABLED = asBoolean(process.env.HOWEN_DEBUG, true);
const LOG_SENSITIVE = asBoolean(process.env.HOWEN_LOG_SENSITIVE, false);

function nowIso(): string {
  return new Date().toISOString();
}

function mask(value: string): string {
  if (LOG_SENSITIVE) {
    return value;
  }

  if (value.length <= 10) {
    return "***";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export const howenLogger = {
  isDebugEnabled(): boolean {
    return DEBUG_ENABLED;
  },
  isSensitiveEnabled(): boolean {
    return LOG_SENSITIVE;
  },
  info(message: string, data?: Record<string, unknown>) {
    if (!DEBUG_ENABLED) {
      return;
    }
    console.info(`[HOWEN][${nowIso()}] ${message}`, data ?? {});
  },
  warn(message: string, data?: Record<string, unknown>) {
    if (!DEBUG_ENABLED) {
      return;
    }
    console.warn(`[HOWEN][${nowIso()}] ${message}`, data ?? {});
  },
  error(message: string, data?: Record<string, unknown>) {
    console.error(`[HOWEN][${nowIso()}] ${message}`, data ?? {});
  },
  secure(value: string): string {
    return mask(value);
  },
};
