import * as cheerio from "cheerio";

import type { SearchOptions, SearchProvider, SearchResult } from "../types";
import { cleanText, truncate } from "../util/text";
import { normalizeUrl } from "../util/url";
import { SearchProviderError, searchFetch } from "./errors";
import { isCjkQuery, keywordQuery } from "./query";

function publisherUrl(link: string): string | null {
  try {
    if (link.startsWith("http://") || link.startsWith("https://")) {
      const url = new URL(link);
      if (url.hostname.endsWith("bing.com") && url.pathname.includes("apiclick")) {
        const target = url.searchParams.get("url");
        return target ? normalizeUrl(decodeURIComponent(target)) : null;
      }
      return normalizeUrl(link);
    }
  } catch {
    return null;
  }
  return null;
}

export class BingNewsProvider implements SearchProvider {
  readonly id = "bing-news";
  readonly label = "Bing News";

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const cjk = isCjkQuery(query);
    const url = new URL("https://www.bing.com/news/search");
    url.searchParams.set("q", keywordQuery(query));
    url.searchParams.set("format", "RSS");
    url.searchParams.set("setlang", cjk ? "zh-CN" : "en-US");

    const response = await searchFetch(
      this.id,
      url.toString(),
      {
        headers: {
          accept: "application/rss+xml,application/xml,text/xml",
          "user-agent": "Mozilla/5.0 (compatible; DossierBot/0.1)",
        },
        signal: options.signal,
      },
      20_000,
    );

    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const results: SearchResult[] = [];

    $("item").each((_, element) => {
      if (results.length >= options.maxResults) return;
      const item = $(element);
      const publisher = cleanText(item.find("News\\:Source, source").first().text());
      let title = cleanText(item.find("title").first().text());
      if (publisher) {
        title = title
          .replace(
            new RegExp(`\\s[-–—|]\\s*${publisher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
            "",
          )
          .trim();
      }
      const url = publisherUrl(item.find("link").first().text().trim());
      if (!title || !url) return;

      const description = cleanText(
        cheerio.load(`<div>${item.find("description").first().text()}</div>`).text(),
      );
      const pubDate = item.find("pubDate").first().text().trim();
      const published = pubDate ? new Date(pubDate) : null;

      results.push({
        title: truncate(title, 240),
        url,
        snippet: truncate(description || title, 500),
        provider: this.id,
        rank: results.length + 1,
        ...(published && !Number.isNaN(published.getTime())
          ? { publishedAt: published.toISOString() }
          : {}),
      });
    });

    if (!/<rss[\s>]/.test(xml)) {
      throw new SearchProviderError(this.id, "Bing News returned an unexpected response.");
    }

    return results;
  }
}
