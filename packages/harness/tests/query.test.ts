import { describe, expect, it } from "vitest";

import { isTechnicalQuery, keywordQuery, queryAnchors, topicalOverlap } from "../src/search/query";
import { splitSentences } from "../src/util/text";

describe("query helpers", () => {
  it("extracts topic anchors without research modifiers", () => {
    expect(
      queryAnchors(
        "Is the four-day work week actually good for productivity and well-being? evidence data study criticism limitations",
      ),
    ).toEqual(["four-day", "work", "week", "productivity", "well-being"]);
  });

  it("keeps generic evidence words out of search keywords", () => {
    const query = keywordQuery("four-day work week evidence data study analysis");
    expect(query).not.toContain("evidence");
    expect(query).not.toContain("study");
    expect(query).toContain("four-day");
  });

  it("gates arXiv searches on genuinely technical topics", () => {
    expect(isTechnicalQuery("four-day work week evidence data study")).toBe(false);
    expect(isTechnicalQuery("grid-scale battery storage economics")).toBe(true);
    expect(isTechnicalQuery("AI coding agents in production")).toBe(true);
  });
});

describe("topical overlap", () => {
  it("scores Chinese topical titles with character bigrams", () => {
    const query = "固态电池产业化还有多远？";
    expect(topicalOverlap(query, "固态电池")).toBeGreaterThan(0.25);
    expect(topicalOverlap(query, "化学元素 氢 氦 锂 铍 硼 碳 氮 氧 氟")).toBeLessThan(0.1);
  });

  it("separates relevant English titles from generic ones", () => {
    const query = "four-day work week productivity well-being";
    expect(topicalOverlap(query, "Four-day workweek")).toBeGreaterThan(0.15);
    expect(topicalOverlap(query, "Kaizen")).toBe(0);
  });
});

describe("sentence splitting", () => {
  it("splits Chinese sentences without requiring whitespace", () => {
    expect(splitSentences("第一句话。第二句话！第三句话？下一句")).toEqual([
      "第一句话。",
      "第二句话！",
      "第三句话？",
      "下一句",
    ]);
  });
});
