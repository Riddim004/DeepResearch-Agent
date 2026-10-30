import { beforeAll, describe, expect, it } from "vitest";

import { runEvaluation, type EvaluationReport } from "../src/evaluation";

describe("evaluation suite", () => {
  let report: EvaluationReport;

  beforeAll(async () => {
    report = await runEvaluation();
  }, 30_000);

  it("passes every benchmark case in the offline fixture corpus", () => {
    expect(report.mode).toBe("offline-fixture");
    expect(report.cases.map((item) => item.id)).toEqual([
      "standard-en",
      "quick-en",
      "chinese",
      "sparse-evidence",
      "search-outage",
      "read-outage",
      "revision-recovery",
    ]);
    for (const result of report.cases) {
      expect(
        result.checks.filter((check) => !check.passed).map((check) => `${result.id}:${check.name}`),
      ).toEqual([]);
    }
    expect(report.summary.passed).toBe(report.cases.length);
    expect(report.summary.passRate).toBe(1);
    expect(["S", "A"]).toContain(report.summary.grade);
    expect(report.summary.citationCoverage).toBeGreaterThan(0.5);
    expect(report.summary.gracefulFailureRate).toBe(1);
    expect(report.summary.tierMix.S + report.summary.tierMix.A).toBeGreaterThan(0);
  });

  it("records a typed failure when search is unavailable", () => {
    const outage = report.cases.find((item) => item.id === "search-outage");

    expect(outage).toBeDefined();
    expect(outage?.outcome).toBe("failure");
    expect(outage?.errorCode).toBe("NO_SOURCES");
    expect(outage?.events.searchFailures).toBeGreaterThan(0);
  });

  it("flags thin evidence without failing the run", () => {
    const sparse = report.cases.find((item) => item.id === "sparse-evidence");

    expect(sparse?.outcome).toBe("success");
    expect(sparse?.metrics?.sourceCount).toBe(2);
    expect(sparse?.checks.find((check) => check.name.includes("audit verdict"))?.passed).toBe(true);
  });
});
