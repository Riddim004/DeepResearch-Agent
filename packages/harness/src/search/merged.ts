import type { HarnessLogger, SearchOptions, SearchProvider, SearchResult } from "../types";
import { normalizeUrl } from "../util/url";
import { SearchProviderError } from "./errors";

export class MergedSearchProvider implements SearchProvider {
  readonly id: string;
  readonly label: string;
  readonly providerIds: string[];

  constructor(
    private readonly providers: SearchProvider[],
    private readonly logger?: HarnessLogger,
  ) {
    if (providers.length === 0)
      throw new Error("A merged search provider needs at least one source.");
    this.providerIds = providers.map((provider) => provider.id);
    this.id = this.providerIds.join("+");
    this.label = providers.map((provider) => provider.label).join(" · ");
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : new DOMException("The search was aborted.", "AbortError");
    }

    const settled = await Promise.allSettled(
      this.providers.map((provider) =>
        provider.search(query, {
          ...options,
          maxResults: Math.min(20, options.maxResults),
        }),
      ),
    );

    const errors: string[] = [];
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    for (let index = 0; index < settled.length; index += 1) {
      const outcome = settled[index];
      if (!outcome) continue;
      if (outcome.status === "rejected") {
        const message =
          outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        errors.push(message);
        this.logger?.warn(`${this.providers[index]?.label ?? "Search"} failed`, {
          query,
          error: message,
        });
        continue;
      }
      for (const result of outcome.value) {
        const url = normalizeUrl(result.url);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        results.push({ ...result, url });
      }
    }

    if (results.length === 0 && errors.length === this.providers.length) {
      throw new SearchProviderError(
        this.id,
        `All search sources failed. ${errors[0] ?? ""}`.trim(),
      );
    }

    return results
      .slice(0, Math.min(30, Math.max(options.maxResults, options.maxResults * 2)))
      .map((result, index) => ({ ...result, rank: index + 1 }));
  }
}
