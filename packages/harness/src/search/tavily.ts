import type { SearchOptions, SearchProvider, SearchResult } from "../types";
import { cleanText, truncate } from "../util/text";
import { normalizeUrl } from "../util/url";
import { SearchProviderError, searchFetch } from "./errors";

interface TavilyResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
    published_date?: string;
  }>;
}

export class TavilyProvider implements SearchProvider {
  readonly id = "tavily";
  readonly label = "Tavily";

  constructor(private readonly apiKey: string) {}

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const response = await searchFetch(
      this.id,
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: Math.min(20, options.maxResults),
          search_depth: "basic",
          include_answer: false,
          include_raw_content: false,
          ...(options.recencyDays ? { days: options.recencyDays } : {}),
        }),
        signal: options.signal,
      },
      20_000,
    );

    const data = (await response.json()) as TavilyResponse;
    if (!Array.isArray(data.results)) {
      throw new SearchProviderError(this.id, "Tavily returned an unexpected response shape.");
    }

    return data.results
      .map((result, index): SearchResult | null => {
        const url = normalizeUrl(result.url ?? "");
        if (!url || !result.title) return null;
        return {
          title: truncate(cleanText(result.title), 240),
          url,
          snippet: truncate(cleanText(result.content ?? ""), 500),
          provider: this.id,
          rank: index + 1,
          ...(result.published_date ? { publishedAt: result.published_date } : {}),
        };
      })
      .filter((result): result is SearchResult => result !== null)
      .slice(0, options.maxResults);
  }
}
