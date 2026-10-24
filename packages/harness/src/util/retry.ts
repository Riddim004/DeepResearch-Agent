import { sleep } from "./async";
import { isAbortError } from "./errors";

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export async function withRetries<T>(
  task: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelay = options.baseDelayMs ?? 600;
  const maxDelay = options.maxDelayMs ?? 8_000;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (isAbortError(error) || options.signal?.aborted) throw error;
      if (attempt >= attempts || !shouldRetry(error)) throw error;
      const jitter = Math.random() * 0.25 + 0.875;
      const delay = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1) * jitter);
      options.onRetry?.(error, attempt, delay);
      await sleep(delay, options.signal);
    }
  }
  throw lastError;
}

export class HttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }

  get retryable(): boolean {
    return this.status === 408 || this.status === 409 || this.status === 429 || this.status >= 500;
  }
}

export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - Date.now());
}
