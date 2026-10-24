import type { HarnessErrorCode } from "../types";

export class HarnessError extends Error {
  readonly code: HarnessErrorCode;
  readonly userMessage: string;

  constructor(code: HarnessErrorCode, userMessage: string, options?: { cause?: unknown }) {
    super(userMessage, options);
    this.name = "HarnessError";
    this.code = code;
    this.userMessage = userMessage;
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

export function isTimeoutError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "TimeoutError") return true;
  if (error instanceof Error && error.name === "TimeoutError") return true;
  return false;
}

export function errorMessage(error: unknown): string {
  if (error instanceof HarnessError) return error.userMessage;
  if (isAbortError(error)) return "The run was cancelled.";
  if (isTimeoutError(error)) return "The run timed out before it could finish.";
  if (error instanceof Error) return error.message;
  return "An unknown error occurred.";
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw new DOMException("The operation was aborted.", "AbortError");
}
