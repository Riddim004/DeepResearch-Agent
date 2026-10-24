import type { SearchOptions, SearchProvider, SearchResult } from "../types";
import { cleanText, truncate } from "../util/text";
import { normalizeUrl } from "../util/url";
import { SearchProviderError, searchFetch } from "./errors";

interface SerperResponse {
  organic?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    date?: string;
  }>;
}

function tbs(days?: number): string | null {
  if (!days) return null;
  if (days <= 1) return "qdr:d";
  if (days <= 7) return "qdr:w";
  if (days <= 31) return "qdr:m";
  return "qdr:y";
}

export class SerperProvider implements SearchProvider {
  readonly id = "serper";
  readonly label = "Google via Serper";

  constructor(private readonly apiKey: string) {}

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const range = tbs(options.recencyDays);
    const response = await searchFetch(
      this.id,
      "https://google.serper.dev/search",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          q: query,
          num: Math.min(20, options.maxResults),
          ...(range ? { tbs: range } : {}),
        }),
        signal: options.signal,
      },
      20_000,
    );

    const data = (await response.json()) as SerperResponse;
    if (!Array.isArray(data.organic)) {
      throw new SearchProviderError(this.id, "Serper returned an unexpected response shape.");
    }

    return data.organic
      .map((result, index): SearchResult | null => {
        const url = normalizeUrl(result.link ?? "");
        if (!url || !result.title) return null;
        return {
          title: truncate(cleanText(result.title), 240),
          url,
          snippet: truncate(cleanText(result.snippet ?? ""), 500),
          provider: this.id,
          rank: index + 1,
          ...(result.date ? { publishedAt: result.date } : {}),
        };
      })
      .filter((result): result is SearchResult => result !== null)
      .slice(0, options.maxResults);
  }
}
