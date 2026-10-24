import type { SearchOptions, SearchProvider, SearchResult } from "../types";
import { cleanText, truncate } from "../util/text";
import { normalizeUrl } from "../util/url";
import { SearchProviderError, searchFetch } from "./errors";

interface BraveResponse {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
      age?: string;
    }>;
  };
}

function freshness(days?: number): string | null {
  if (!days) return null;
  if (days <= 1) return "pd";
  if (days <= 7) return "pw";
  if (days <= 31) return "pm";
  return "py";
}

export class BraveProvider implements SearchProvider {
  readonly id = "brave";
  readonly label = "Brave Search";

  constructor(private readonly apiKey: string) {}

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.min(20, options.maxResults)));
    const fresh = freshness(options.recencyDays);
    if (fresh) url.searchParams.set("freshness", fresh);

    const response = await searchFetch(
      this.id,
      url.toString(),
      {
        headers: {
          accept: "application/json",
          "x-subscription-token": this.apiKey,
        },
        signal: options.signal,
      },
      20_000,
    );

    const data = (await response.json()) as BraveResponse;
    const items = data.web?.results;
    if (!Array.isArray(items)) {
      throw new SearchProviderError(this.id, "Brave returned an unexpected response shape.");
    }

    return items
      .map((result, index): SearchResult | null => {
        const normalized = normalizeUrl(result.url ?? "");
        if (!normalized || !result.title) return null;
        return {
          title: truncate(cleanText(result.title), 240),
          url: normalized,
          snippet: truncate(cleanText(result.description ?? ""), 500),
          provider: this.id,
          rank: index + 1,
        };
      })
      .filter((result): result is SearchResult => result !== null)
      .slice(0, options.maxResults);
  }
}
