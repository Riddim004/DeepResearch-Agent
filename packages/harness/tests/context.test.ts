import { describe, expect, it } from "vitest";
import { buildEvidenceContext } from "../src/context";
import type { ResearchBrief, Source, SourceDocument } from "../src/types";
import { estimateTokens } from "../src/util/text";

const brief: ResearchBrief = {
  title: "Test brief",
  restated: "What does the evidence say about agent harness reliability?",
  audience: "Engineers",
  subquestions: [{ question: "How reliable are agent harnesses?", why: "Core question" }],
  queries: [{ query: "agent harness reliability", kind: "primary", rationale: "" }],
  successCriteria: [],
};

function document(index: number, text: string): SourceDocument {
  const source: Source = {
    id: `s${index}`,
    number: null,
    title: `Source ${index}`,
    url: `https://example.com/${index}`,
    domain: "example.com",
    snippet: "",
    provider: "fixture",
    score: 0.8 - index * 0.05,
    status: "read",
  };
  return { source, text };
}

describe("buildEvidenceContext", () => {
  it("selects evidence within budget and assigns stable citation numbers", () => {
    const docs = [
      document(
        1,
        "Agent harness reliability depends on typed tools, budgets, and traces. ".repeat(30),
      ),
      document(2, "Context engineering controls which evidence reaches the model. ".repeat(30)),
      document(3, "Observability makes failures reproducible and debuggable. ".repeat(30)),
    ];
    const selection = buildEvidenceContext(docs, brief, 1_500);
    expect(selection.citations.length).toBeGreaterThan(0);
    expect(selection.citations[0]?.number).toBe(1);
    expect(estimateTokens(selection.text)).toBeLessThanOrEqual(1_500);
    expect(selection.text).toContain("[1]");
    expect(new Set(selection.citations.map((item) => item.sourceId)).size).toBe(
      selection.citations.length,
    );
  });

  it("does not repeat near-identical passages", () => {
    const repeated =
      "Agent harnesses need typed tools and explicit context budgets to stay reliable. ".repeat(8);
    const selection = buildEvidenceContext(
      [document(1, repeated), document(2, repeated)],
      brief,
      4_000,
    );
    expect(selection.sources.length).toBe(1);
  });

  it("throws when the budget cannot fit usable evidence", () => {
    expect(() => buildEvidenceContext([document(1, "Short text. ".repeat(20))], brief, 30)).toThrow(
      /enough usable text/i,
    );
  });
});
