import { describe, expect, it } from "vitest";
import {
  appendSourceLedger,
  citationStats,
  linkifyCitations,
  normalizeReportMarkdown,
  sanitizeCitations,
} from "../src/citations";
import type { Source } from "../src/types";

const source = (number: number, id: string): Source => ({
  id,
  number,
  title: `Source ${number}`,
  url: `https://example.com/${number}`,
  domain: "example.com",
  snippet: "",
  provider: "fixture",
  score: 0.5,
  status: "read",
});

describe("citation utilities", () => {
  it("links only valid citation markers outside code", () => {
    const input = "Claim [1] and [2, 3]. Code `[9]` and `[1]`. [1](https://example.com)";
    const linked = linkifyCitations(input, new Set([1, 2, 3]));
    expect(linked).toContain("[1](cite:1)");
    expect(linked).toContain("[2](cite:2)[3](cite:3)");
    expect(linked).toContain("`[9]`");
    expect(linked).toContain("[1](https://example.com)");
  });

  it("removes citations that point to no source", () => {
    const result = sanitizeCitations("A [1] B [99] C [1, 99].", new Set([1]));
    expect(result.text).toBe("A [1] B  C [1].");
    expect(result.removed).toEqual([99, 99]);
  });

  it("computes sentence-level citation coverage", () => {
    const markdown = `# Title

This is a substantive sentence with a claim [1]. This sentence has no citation at all.
Another sentence supports a second point [2].

## Sources

1. Not counted [99].`;
    const stats = citationStats(markdown);
    expect(stats.sentences).toBe(3);
    expect(stats.citedSentences).toBe(2);
    expect(stats.coverage).toBeCloseTo(2 / 3, 3);
    expect(stats.numbers).toEqual([1, 2]);
  });

  it("unwraps whole-document code fences and ensures a title", () => {
    const markdown = "```markdown\nA report without a title.\n```";
    expect(normalizeReportMarkdown(markdown, "Fallback title")).toMatch(/^# Fallback title/);
  });

  it("appends a numbered source ledger once", () => {
    const markdown = "# Report\n\nClaim [1].";
    const ledger = appendSourceLedger(markdown, [source(1, "s1")]);
    expect(ledger).toContain("## Sources");
    expect(ledger).toContain("1. [Source 1](https://example.com/1)");
    expect(appendSourceLedger(ledger, [source(1, "s1")])).toBe(ledger);
  });
});
