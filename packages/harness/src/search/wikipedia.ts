import * as cheerio from "cheerio";

import type { SearchOptions, SearchProvider, SearchResult } from "../types";
import { cleanText, truncate } from "../util/text";
import { normalizeUrl } from "../util/url";
import { SearchProviderError, searchFetch } from "./errors";
import { isCjkQuery, keywordQuery, topicalOverlap } from "./query";

interface WikipediaResponse {
  query?: {
    search?: Array<{
      title?: string;
      snippet?: string;
      wordcount?: number;
    }>;
  };
}

export class WikipediaProvider implements SearchProvider {
  readonly id = "wikipedia";
  readonly label = "Wikipedia";

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const cjk = isCjkQuery(query);
    const url = new URL(
      cjk ? "https://zh.wikipedia.org/w/api.php" : "https://en.wikipedia.org/w/api.php",
    );
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "search");
    url.searchParams.set("srsearch", truncate(keywordQuery(query), 240));
    url.searchParams.set("srlimit", String(Math.min(20, options.maxResults)));
    url.searchParams.set("format", "json");
    url.searchParams.set("utf8", "1");

    const response = await searchFetch(
      this.id,
      url.toString(),
      {
        headers: {
          accept: "application/json",
          "user-agent": "DossierBot/0.1 (+https://github.com/Riddim004/DeepResearch-Agent)",
        },
        signal: options.signal,
      },
      20_000,
    );

    const data = (await response.json()) as WikipediaResponse;
    if (!Array.isArray(data.query?.search)) {
      throw new SearchProviderError(this.id, "Wikipedia returned an unexpected response shape.");
    }

    return data.query.search
      .map(
        (item, index): { result: SearchResult; overlap: number; titleOverlap: number } | null => {
          if (!item.title) return null;
          const pageUrl = normalizeUrl(
            `${cjk ? "https://zh.wikipedia.org" : "https://en.wikipedia.org"}/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
          );
          if (!pageUrl) return null;
          const snippet = cleanText(cheerio.load(`<div>${item.snippet ?? ""}</div>`).text());
          const result: SearchResult = {
            title: item.title,
            url: pageUrl,
            snippet: truncate(snippet, 500),
            provider: this.id,
            rank: index + 1,
          };
          const overlap = topicalOverlap(query, `${item.title} ${snippet}`);
          const titleOverlap = topicalOverlap(query, item.title);
          return { result, overlap, titleOverlap };
        },
      )
      .filter(
        (item): item is { result: SearchResult; overlap: number; titleOverlap: number } =>
          item !== null,
      )
      .sort((a, b) => b.overlap - a.overlap)
      .filter((item) => item.overlap >= 0.28 && item.titleOverlap >= 0.25)
      .slice(0, options.maxResults)
      .map((item) => item.result);
  }
}
