import * as cheerio from "cheerio";
import type { SearchOptions, SearchProvider, SearchResult } from "../types";
import { SerialQueue } from "../util/async";
import { cleanText, truncate } from "../util/text";
import { decodeDuckDuckGoUrl, normalizeUrl } from "../util/url";
import { SearchProviderError, searchFetch } from "./errors";

const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml",
  "accept-language": "en-US,en;q=0.9",
};

export class DuckDuckGoProvider implements SearchProvider {
  readonly id = "duckduckgo";
  readonly label = "DuckDuckGo";
  private readonly queue = new SerialQueue();

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    return this.queue.run(async () => {
      const html = await this.fetchResults(query, options);
      let results = parseDuckDuckGoHtml(html, options.maxResults);
      if (results.length === 0) {
        const lite = await this.fetchLite(query, options);
        results = parseDuckDuckGoLite(lite, options.maxResults);
      }
      return results;
    });
  }

  private async fetchResults(query: string, options: SearchOptions): Promise<string> {
    const url = new URL("https://html.duckduckgo.com/html/");
    url.searchParams.set("q", query);
    url.searchParams.set("kl", "us-en");
    if (options.recencyDays && options.recencyDays <= 1) url.searchParams.set("df", "d");
    else if (options.recencyDays && options.recencyDays <= 7) url.searchParams.set("df", "w");
    else if (options.recencyDays && options.recencyDays <= 31) url.searchParams.set("df", "m");
    const response = await searchFetch(
      this.id,
      url.toString(),
      { headers: HEADERS, signal: options.signal },
      20_000,
    );
    if (response.status === 202) {
      throw new SearchProviderError(
        this.id,
        "DuckDuckGo is rate limiting automated searches.",
        202,
      );
    }
    return response.text();
  }

  private async fetchLite(query: string, options: SearchOptions): Promise<string> {
    const url = new URL("https://lite.duckduckgo.com/lite/");
    url.searchParams.set("q", query);
    try {
      const response = await searchFetch(
        this.id,
        url.toString(),
        { headers: HEADERS, signal: options.signal },
        20_000,
      );
      if (response.status === 202) {
        throw new SearchProviderError(
          this.id,
          "DuckDuckGo is rate limiting automated searches.",
          202,
        );
      }
      return response.text();
    } catch (error) {
      if (error instanceof SearchProviderError) throw error;
      return "";
    }
  }
}

export function parseDuckDuckGoHtml(html: string, maxResults: number): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $(".result").each((_, element) => {
    if (results.length >= maxResults) return;
    const node = $(element);
    if (node.hasClass("result--ad")) return;
    const anchor = node.find(".result__a").first();
    const title = cleanText(anchor.text());
    const href = anchor.attr("href") ?? "";
    const url = normalizeUrl(decodeDuckDuckGoUrl(href));
    const snippet = cleanText(node.find(".result__snippet").first().text());
    if (!title || !url) return;
    results.push({
      title: truncate(title, 240),
      url,
      snippet: truncate(snippet, 500),
      provider: "duckduckgo",
      rank: results.length + 1,
    });
  });

  return results;
}

export function parseDuckDuckGoLite(html: string, maxResults: number): SearchResult[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $("a.result-link").each((_, element) => {
    if (results.length >= maxResults) return;
    const anchor = $(element);
    const title = cleanText(anchor.text());
    const url = normalizeUrl(decodeDuckDuckGoUrl(anchor.attr("href") ?? ""));
    if (!title || !url) return;

    const row = anchor.closest("tr");
    const snippet = cleanText(row.next("tr").find(".result-snippet").text());
    results.push({
      title: truncate(title, 240),
      url,
      snippet: truncate(snippet, 500),
      provider: "duckduckgo",
      rank: results.length + 1,
    });
  });

  return results;
}
