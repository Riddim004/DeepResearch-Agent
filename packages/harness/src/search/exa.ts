import type { SearchOptions, SearchProvider, SearchResult } from "../types";
import { cleanText, truncate } from "../util/text";
import { normalizeUrl } from "../util/url";
import { SearchProviderError, searchFetch } from "./errors";

interface ExaResponse {
  results?: Array<{
    title?: string;
    url?: string;
    text?: string;
    summary?: string;
    publishedDate?: string;
    score?: number;
  }>;
}

export class ExaProvider implements SearchProvider {
  readonly id = "exa";
  readonly label = "Exa";

  constructor(private readonly apiKey: string) {}

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const response = await searchFetch(
      this.id,
      "https://api.exa.ai/search",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          query,
          numResults: Math.min(20, options.maxResults),
          type: "auto",
          contents: { text: { maxCharacters: 800 } },
          ...(options.recencyDays
            ? {
                startPublishedDate: new Date(
                  Date.now() - options.recencyDays * 86_400_000,
                ).toISOString(),
              }
            : {}),
        }),
        signal: options.signal,
      },
      25_000,
    );

    const data = (await response.json()) as ExaResponse;
    if (!Array.isArray(data.results)) {
      throw new SearchProviderError(this.id, "Exa returned an unexpected response shape.");
    }

    return data.results
      .map((result, index): SearchResult | null => {
        const url = normalizeUrl(result.url ?? "");
        if (!url || !result.title) return null;
        return {
          title: truncate(cleanText(result.title), 240),
          url,
          snippet: truncate(cleanText(result.summary ?? result.text ?? ""), 500),
          provider: this.id,
          rank: index + 1,
          ...(result.publishedDate ? { publishedAt: result.publishedDate } : {}),
        };
      })
      .filter((result): result is SearchResult => result !== null)
      .slice(0, options.maxResults);
  }
}
