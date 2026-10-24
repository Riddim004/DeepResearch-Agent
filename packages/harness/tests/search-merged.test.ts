import { describe, expect, it } from "vitest";
import { MergedSearchProvider } from "../src/search/merged";
import type { SearchOptions, SearchProvider, SearchResult } from "../src/types";

function provider(id: string, results: SearchResult[] | Error): SearchProvider {
  return {
    id,
    label: id,
    async search(_query: string, _options: SearchOptions) {
      if (results instanceof Error) throw results;
      return results;
    },
  };
}

const result = (url: string, rank: number): SearchResult => ({
  title: `Result ${url}`,
  url,
  snippet: "snippet",
  provider: "fixture",
  rank,
});

describe("MergedSearchProvider", () => {
  it("merges sources, deduplicates URLs, and re-ranks", async () => {
    const merged = new MergedSearchProvider([
      provider("a", [result("https://example.com/one", 1), result("https://example.com/two", 2)]),
      provider("b", [result("https://example.com/two", 1), result("https://example.com/three", 2)]),
    ]);
    const results = await merged.search("test", { maxResults: 5 });
    expect(results.map((item) => item.url)).toEqual([
      "https://example.com/one",
      "https://example.com/two",
      "https://example.com/three",
    ]);
    expect(results.map((item) => item.rank)).toEqual([1, 2, 3]);
  });

  it("survives a failing provider", async () => {
    const merged = new MergedSearchProvider([
      provider("a", new Error("blocked")),
      provider("b", [result("https://example.com/ok", 1)]),
    ]);
    const results = await merged.search("test", { maxResults: 5 });
    expect(results).toHaveLength(1);
  });

  it("throws when every provider fails", async () => {
    const merged = new MergedSearchProvider([
      provider("a", new Error("blocked")),
      provider("b", new Error("offline")),
    ]);
    await expect(merged.search("test", { maxResults: 5 })).rejects.toThrow(/all search sources/i);
  });
});
