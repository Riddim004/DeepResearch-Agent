import { readFile } from "node:fs/promises";
import path from "node:path";

import type { EvaluationReport } from "@dossier/harness";

export async function loadEvaluationReport(): Promise<EvaluationReport | null> {
  const cwd = process.cwd();
  const candidates = Array.from(
    new Set([
      path.join(cwd, "evals", "latest.json"),
      path.join(cwd, "..", "..", "evals", "latest.json"),
      path.join(cwd, "..", "evals", "latest.json"),
    ]),
  );

  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf8");
      const parsed = JSON.parse(raw) as EvaluationReport;
      if (
        parsed?.version === 1 &&
        parsed.summary &&
        typeof parsed.summary.passed === "number" &&
        Array.isArray(parsed.cases)
      ) {
        return parsed;
      }
    } catch {
      // Try the next location; the report is optional in local development.
    }
  }

  return null;
}
