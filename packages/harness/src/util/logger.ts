import type { HarnessLogger } from "../types";

export const silentLogger: HarnessLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export const consoleLogger: HarnessLogger = {
  debug(message, data) {
    if (process.env.NODE_ENV !== "production") console.debug(`[harness] ${message}`, data ?? "");
  },
  info(message, data) {
    console.info(`[harness] ${message}`, data ?? "");
  },
  warn(message, data) {
    console.warn(`[harness] ${message}`, data ?? "");
  },
  error(message, data) {
    console.error(`[harness] ${message}`, data ?? "");
  },
};
