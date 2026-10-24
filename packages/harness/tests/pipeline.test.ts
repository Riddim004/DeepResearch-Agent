import { describe, expect, it } from "vitest";
import { FIXTURE_QUERY, FixturePageFetcher, FixtureSearchProvider } from "../src/testing/fixtures";
import { MockProvider } from "../src/providers/mock";
import { runResearch } from "../src/pipeline";
import type { HarnessEvent } from "../src/types";

function runtimeEvents() {
  const events: HarnessEvent[] = [];
  return { events };
}

describe("runResearch (offline end-to-end)", () => {
  it("runs every phase and produces a cited, audited brief", async () => {
    const { events } = runtimeEvents();
    const result = await runResearch(
      { query: FIXTURE_QUERY, depth: "standard", language: "en" },
      {
        provider: new MockProvider({ delayMs: 0 }),
        search: new FixtureSearchProvider(),
        fetcher: new FixturePageFetcher(),
        onEvent: (event) => events.push(event),
      },
    );

    const phases = events
      .filter((event) => event.type === "phase.started")
      .map((event) => (event.type === "phase.started" ? event.phase : ""));
    expect(phases).toEqual(["scope", "discover", "read", "write", "audit"]);
    expect(events.some((event) => event.type === "context.built")).toBe(true);
    expect(events.some((event) => event.type === "report.delta")).toBe(true);

    expect(result.brief.queries.length).toBeGreaterThan(0);
    expect(result.report.markdown).toContain("# ");
    expect(result.report.citationCount).toBeGreaterThan(2);
    expect(result.sources.filter((source) => source.status === "read").length).toBeGreaterThan(2);
    expect(result.audit.citationCoverage).toBeGreaterThan(0.5);
    expect(result.audit.verdict).toBe("pass");
    expect(result.stats.read).toBeGreaterThan(2);
    expect(result.stats.usage.totalTokens).toBeGreaterThan(0);

    const validNumbers = new Set(result.citations.map((citation) => citation.number));
    for (const match of result.report.markdown.matchAll(/\[(\d+)\]/g)) {
      expect(validNumbers.has(Number(match[1]))).toBe(true);
    }
    for (const source of result.sources) {
      if (source.number !== null) {
        expect(validNumbers.has(source.number)).toBe(true);
      }
    }
  });

  it("honors cancellation", async () => {
    const controller = new AbortController();
    await expect(
      runResearch(
        { query: FIXTURE_QUERY, depth: "standard" },
        {
          provider: new MockProvider({ delayMs: 0 }),
          search: new FixtureSearchProvider(),
          fetcher: new FixturePageFetcher(),
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "phase.started" && event.phase === "discover") {
              controller.abort(new DOMException("cancelled", "AbortError"));
            }
          },
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
