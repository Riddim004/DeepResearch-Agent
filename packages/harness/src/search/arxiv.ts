import * as cheerio from "cheerio";

import type { SearchOptions, SearchProvider, SearchResult } from "../types";
import { cleanText, truncate } from "../util/text";
import { normalizeUrl } from "../util/url";
import { SearchProviderError, searchFetch } from "./errors";
import { isCjkQuery, isTechnicalQuery, keywordQuery } from "./query";

export class ArxivProvider implements SearchProvider {
  readonly id = "arxiv";
  readonly label = "arXiv";

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    if (isCjkQuery(query) || !isTechnicalQuery(query)) return [];

    const keywords = keywordQuery(query).split(" ").filter(Boolean).slice(0, 4);
    if (keywords.length === 0) return [];

    const url = new URL("https://export.arxiv.org/api/query");
    url.searchParams.set(
      "search_query",
      keywords.map((term) => `all:${term.replace(/[^\p{L}\p{N}-]/gu, "")}`).join(" AND "),
    );
    url.searchParams.set("start", "0");
    url.searchParams.set("max_results", String(Math.min(20, options.maxResults)));
    url.searchParams.set("sortBy", "relevance");

    const response = await searchFetch(
      this.id,
      url.toString(),
      {
        headers: {
          accept: "application/atom+xml",
          "user-agent": "DossierBot/0.1 (+https://github.com/Riddim004/DeepResearch-Agent)",
        },
        signal: options.signal,
      },
      25_000,
    );

    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const results: SearchResult[] = [];

    $("entry").each((_, element) => {
      if (results.length >= options.maxResults) return;
      const entry = $(element);
      const title = cleanText(entry.find("title").first().text());
      const summary = cleanText(entry.find("summary").first().text());
      const id = entry.find("id").first().text().trim();
      const published = entry.find("published").first().text().trim();
      const url = normalizeUrl(id);
      if (!title || !url) return;
      results.push({
        title: truncate(title, 240),
        url,
        snippet: truncate(summary, 500),
        provider: this.id,
        rank: results.length + 1,
        ...(published ? { publishedAt: published } : {}),
      });
    });

    if (results.length === 0 && /<entry[\s>]/.test(xml) === false && !/<feed[\s>]/.test(xml)) {
      throw new SearchProviderError(this.id, "arXiv returned an unexpected response.");
    }

    return results;
  }
}
