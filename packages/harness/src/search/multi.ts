import type { SearchOptions, SearchProvider, SearchResult } from "../types";
import type { HarnessLogger } from "../types";

export class MultiSearchProvider implements SearchProvider {
  readonly id: string;
  readonly label: string;

  constructor(
    private readonly primary: SearchProvider,
    private readonly fallback: SearchProvider | null,
    private readonly logger?: HarnessLogger,
  ) {
    this.id = primary.id;
    this.label = fallback ? `${primary.label} → ${fallback.label}` : primary.label;
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    try {
      const results = await this.primary.search(query, options);
      if (results.length > 0 || !this.fallback) return results;
      this.logger?.warn(`${this.primary.label} returned no results; falling back`, { query });
    } catch (error) {
      if (!this.fallback) throw error;
      this.logger?.warn(`${this.primary.label} failed; falling back`, {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return this.fallback.search(query, options);
  }
}
