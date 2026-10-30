#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

import { runEvaluation, type EvaluationReport } from "@dossier/harness";

const HELP = `Dossier evaluation — deterministic regression suite for the research harness.

Usage
  npm run eval [options]

Options
  -o, --out <file>   Write the JSON report (default: evals/latest.json)
      --json         Print the report as JSON instead of a summary table
  -h, --help         Show this help

The suite uses a fixed offline corpus and a deterministic writer. It measures
pass rate, citation coverage, source authority (S/A/B/C), diversity, graceful
failure handling, latency, and token usage. A failing case exits with code 1.
`;

interface EvalOptions {
  out: string;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): EvalOptions {
  const options: EvalOptions = {
    out: resolve(process.cwd(), "evals/latest.json"),
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "-o" || arg === "--out") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a path.`);
      options.out = resolve(process.cwd(), value);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;
}

function printReport(report: EvaluationReport, out: string): void {
  const { summary } = report;
  console.log("Dossier evaluation · offline fixture corpus · deterministic writer");
  console.log(
    `${summary.passed}/${summary.cases} cases passed · grade ${summary.grade} · composite ${summary.composite.toFixed(3)}`,
  );
  console.log("");
  console.log(
    `${pad("case", 22)} ${pad("result", 8)} ${pad("cite", 6)} ${pad("cover", 7)} ${pad("auth", 6)} ${pad("dom", 5)} ${pad("time", 8)}`,
  );
  for (const result of report.cases) {
    const metrics = result.metrics;
    console.log(
      `${pad(result.id, 22)} ${pad(result.passed ? "pass" : "fail", 8)} ${pad(metrics ? String(metrics.citations) : "—", 6)} ${pad(metrics ? `${Math.round(metrics.coverage * 100)}%` : "—", 7)} ${pad(metrics ? metrics.authority.toFixed(2) : "—", 6)} ${pad(metrics ? String(metrics.domains) : "—", 5)} ${pad(metrics ? `${metrics.durationMs}ms` : "—", 8)}`,
    );
  }
  console.log("");
  console.log(
    `cited source tiers: S ${summary.tierMix.S} · A ${summary.tierMix.A} · B ${summary.tierMix.B} · C ${summary.tierMix.C}`,
  );
  console.log(
    `coverage ${Math.round(summary.citationCoverage * 100)}% · audit ${summary.auditScore}/100 · authority ${summary.authorityScore.toFixed(2)} · graceful failures ${Math.round(summary.gracefulFailureRate * 100)}%`,
  );
  console.log(
    `avg latency ${summary.avgLatencyMs}ms · tokens ${summary.totalTokens.toLocaleString("en-US")} · total ${report.durationMs}ms`,
  );
  console.log(`report → ${out}`);
}

async function main(): Promise<void> {
  let options: EvalOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("");
    console.error(HELP);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(HELP);
    return;
  }

  const report = await runEvaluation();
  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report, options.out);

  if (report.summary.passed !== report.summary.cases) process.exitCode = 1;
}

await main();
