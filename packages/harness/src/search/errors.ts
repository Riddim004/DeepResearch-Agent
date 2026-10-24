export class SearchProviderError extends Error {
  readonly provider: string;
  readonly status: number | null;

  constructor(provider: string, message: string, status: number | null = null) {
    super(message);
    this.name = "SearchProviderError";
    this.provider = provider;
    this.status = status;
  }
}

export async function searchFetch(
  provider: string,
  input: string,
  init: RequestInit,
  timeoutMs = 15_000,
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signals = [init.signal, timeout].filter((signal): signal is AbortSignal => Boolean(signal));
  const signal = signals.length > 1 ? AbortSignal.any(signals) : timeout;
  const response = await fetch(input, { ...init, signal });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new SearchProviderError(
      provider,
      `${provider} search failed with HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      response.status,
    );
  }
  return response;
}
