import type { HarnessLogger } from "@dossier/harness";

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, message: string, data?: Record<string, unknown>): void {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    scope: "dossier",
    message,
    ...(data ?? {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const serverLogger: HarnessLogger = {
  debug: (message, data) => write("debug", message, data),
  info: (message, data) => write("info", message, data),
  warn: (message, data) => write("warn", message, data),
  error: (message, data) => write("error", message, data),
};

export function redactSecrets(message: string): string {
  return message
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "sk-[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi, "Bearer [redacted]")
    .replace(/\b(api[_-]?key|token)\s*[=:]\s*["']?[A-Za-z0-9._-]{12,}["']?/gi, "$1=[redacted]")
    .slice(0, 1_000);
}
