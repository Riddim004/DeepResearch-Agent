#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

import {
  DEPTH_PROFILES,
  HarnessError,
  appendSourceLedger,
  createRuntimeFromEnv,
  errorMessage,
  isAbortError,
  isTimeoutError,
  runResearch,
  type Depth,
  type HarnessEvent,
  type HarnessLogger,
  type ResearchResult,
} from "@dossier/harness";

const VERSION = "0.1.0";

interface CliOptions {
  query: string;
  depth: Depth;
  language?: string;
  audience?: string;
  out?: string;
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  demo: boolean;
  color: boolean;
  help: boolean;
  version: boolean;
}

const HELP = `Dossier — evidence-first deep research, from the command line.

Usage
  npm run cli -- "your question" [options]
  dossier "your question" [options]

Options
  -d, --depth <quick|standard|deep>   Research effort (default: standard)
  -l, --lang <code>                   Output language, for example en or zh
  -a, --audience <text>               Describe the intended reader
  -o, --out <file>                    Write the Markdown brief to a file
      --json                          Print the full run result as JSON
      --demo                          Force the deterministic demo writer
  -q, --quiet                         Hide progress; emit only the brief
      --verbose                       Show searches and every source read
      --no-color                      Disable ANSI color
  -h, --help                          Show this help
      --version                       Print the version

Environment
  OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL
      Any OpenAI-compatible endpoint. Without a key Dossier uses its demo writer
      and still reads real web sources.
  SEARCH_PROVIDER, TAVILY_API_KEY, BRAVE_API_KEY, SERPER_API_KEY, EXA_API_KEY
      Optional search upgrades. DuckDuckGo plus a free fallback stack is the default.

Examples
  npm run cli -- "Is the four-day work week actually good for productivity?"
  npm run cli -- "固态电池产业化还有多远" --depth deep --lang zh --out brief.md
  npm run cli -- "AI coding agents in production" --json > run.json
`;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    query: "",
    depth: "standard",
    json: false,
    quiet: false,
    verbose: false,
    demo: false,
    color: true,
    help: false,
    version: false,
  };
  const positionals: string[] = [];

  const readValue = (inline: string | undefined, index: number, flag: string): [string, number] => {
    if (inline !== undefined) {
      if (!inline) throw new Error(`${flag} needs a value.`);
      return [inline, index];
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("-")) throw new Error(`${flag} needs a value.`);
    return [next, index + 1];
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (token === "-h" || token === "--help") {
      options.help = true;
      continue;
    }
    if (token === "--version") {
      options.version = true;
      continue;
    }
    if (token === "-q" || token === "--quiet") {
      options.quiet = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--demo") {
      options.demo = true;
      continue;
    }
    if (token === "--verbose") {
      options.verbose = true;
      continue;
    }
    if (token === "--no-color") {
      options.color = false;
      continue;
    }
    if (token === "-d" || token === "--depth" || token.startsWith("--depth=")) {
      const eq = token.indexOf("=");
      const [value, next] = readValue(eq === -1 ? undefined : token.slice(eq + 1), index, token);
      if (value !== "quick" && value !== "standard" && value !== "deep") {
        throw new Error(`Unknown depth "${value}". Use quick, standard, or deep.`);
      }
      options.depth = value;
      index = next;
      continue;
    }
    if (token === "-l" || token === "--lang" || token.startsWith("--lang=")) {
      const eq = token.indexOf("=");
      const [value, next] = readValue(eq === -1 ? undefined : token.slice(eq + 1), index, token);
      options.language = value;
      index = next;
      continue;
    }
    if (token === "-a" || token === "--audience" || token.startsWith("--audience=")) {
      const eq = token.indexOf("=");
      const [value, next] = readValue(eq === -1 ? undefined : token.slice(eq + 1), index, token);
      options.audience = value;
      index = next;
      continue;
    }
    if (token === "-o" || token === "--out" || token.startsWith("--out=")) {
      const eq = token.indexOf("=");
      const [value, next] = readValue(eq === -1 ? undefined : token.slice(eq + 1), index, token);
      options.out = value;
      index = next;
      continue;
    }
    if (token.startsWith("-") && token !== "-") {
      throw new Error(`Unknown option "${token}". Run with --help to see the available flags.`);
    }
    positionals.push(token);
  }

  options.query = positionals.join(" ").trim();
  return options;
}

function loadEnvFiles(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // The file is optional.
    }
  }
}

function createPalette(enabled: boolean) {
  const wrap = (open: string, close: string) => (text: string) =>
    enabled ? `\x1b[${open}m${text}\x1b[${close}m` : text;
  return {
    bold: wrap("1", "22"),
    dim: wrap("2", "22"),
    red: wrap("31", "39"),
    green: wrap("32", "39"),
    yellow: wrap("33", "39"),
    blue: wrap("34", "39"),
    magenta: wrap("35", "39"),
    cyan: wrap("36", "39"),
  };
}

type Palette = ReturnType<typeof createPalette>;

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.max(1, Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCost(value: number | null): string {
  if (value === null) return "—";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function truncateMiddle(text: string, width: number): string {
  if (text.length <= width) return text;
  const side = Math.max(4, Math.floor((width - 1) / 2));
  return `${text.slice(0, side)}…${text.slice(-side)}`;
}

async function main(): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    return 1;
  }

  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (!options.query) {
    process.stderr.write(
      `${errorMessage(new Error("Missing research question. Try --help for usage."))}\n`,
    );
    return 1;
  }

  loadEnvFiles();
  if (options.demo) process.env.DOSSIER_DEMO = "1";

  const color = options.color && Boolean(process.stderr.isTTY) && !process.env.NO_COLOR;
  const palette = createPalette(color);
  const log = (line = "") => {
    if (!options.quiet) process.stderr.write(`${line}\n`);
  };
  const profile = DEPTH_PROFILES[options.depth];
  const startedAt = Date.now();

  const controller = new AbortController();
  let interrupts = 0;
  const onSigint = () => {
    interrupts += 1;
    if (interrupts > 1) process.exit(130);
    controller.abort();
    log(palette.yellow("  Cancelling… press Ctrl+C again to force."));
  };
  process.on("SIGINT", onSigint);

  const logger: HarnessLogger = {
    debug: (message, data) => {
      if (options.verbose) log(palette.dim(`  · ${message}${formatData(data)}`));
    },
    info: () => undefined,
    warn: (message, data) => log(palette.yellow(`  ! ${message}${formatData(data)}`)),
    error: (message, data) => log(palette.red(`  ! ${message}${formatData(data)}`)),
  };

  let runtime: ReturnType<typeof createRuntimeFromEnv>;
  try {
    runtime = createRuntimeFromEnv(process.env, { logger });
  } catch (error) {
    process.stderr.write(`${palette.red("Cannot start:")} ${errorMessage(error)}\n`);
    return 1;
  }

  const tracked = {
    searches: 0,
    found: 0,
    read: 0,
    failed: 0,
    followUps: 0,
    phaseStart: 0,
    words: 0,
    citations: 0,
  };

  const phaseLine = (label: string, detail: string, elapsed: string) => {
    log(
      `  ${palette.green("✓")} ${label.padEnd(10)} ${palette.dim(detail)}  ${palette.dim(elapsed)}`,
    );
  };

  if (!options.quiet) {
    log();
    log(
      `${palette.cyan("◆")} ${palette.bold("DOSSIER")} ${palette.dim("· evidence-first deep research")}`,
    );
    log();
    log(`  ${palette.dim("question")}  ${options.query}`);
    const mode = runtime.demo
      ? `${palette.yellow("demo writer")} ${palette.dim("· real web sources")}`
      : palette.green(runtime.model);
    log(
      `  ${palette.dim("profile ")}  ${profile.name} ${palette.dim("·")} ${mode} ${palette.dim("·")} ${truncateMiddle(runtime.searchLabel, 64)}`,
    );
    log();
  }

  let result: ResearchResult | null = null;
  const timeoutController = new AbortController();
  const timeoutTimer = setTimeout(() => {
    timeoutController.abort(
      new DOMException("The run hit its time budget and was stopped.", "TimeoutError"),
    );
  }, profile.timeoutMs);
  timeoutTimer.unref();
  const signal = AbortSignal.any([controller.signal, timeoutController.signal]);

  const onEvent = (event: HarnessEvent): void => {
    switch (event.type) {
      case "phase.started":
        tracked.phaseStart = Date.now();
        if (options.verbose) log(palette.dim(`  ${event.index + 1}/${event.total} ${event.label}`));
        break;
      case "plan.created": {
        if (options.verbose) {
          log(
            `  ${palette.dim("·")} ${event.brief.subquestions.length} subquestions, ${event.brief.queries.length} searches planned`,
          );
        }
        break;
      }
      case "search.completed":
        tracked.searches += 1;
        if (options.verbose) {
          log(
            palette.dim(
              `  · search "${truncateMiddle(event.query, 58)}" → ${event.count} results (${event.newCount} new) · ${formatDuration(event.durationMs)}`,
            ),
          );
        }
        break;
      case "search.failed":
        if (options.verbose)
          log(
            palette.yellow(
              `  · search failed "${truncateMiddle(event.query, 58)}" — ${event.error}`,
            ),
          );
        break;
      case "source.found":
        tracked.found += 1;
        break;
      case "source.read":
        tracked.read += 1;
        if (options.verbose) {
          log(
            `  ${palette.green("✓")} read ${palette.dim(truncateMiddle(event.source.domain, 30))} ${palette.dim("·")} ${truncateMiddle(event.source.title, 60)}`,
          );
        }
        break;
      case "source.failed":
        tracked.failed += 1;
        if (options.verbose) log(palette.dim(`  · skipped ${event.title}: ${event.error}`));
        break;
      case "coverage.assessed":
        tracked.followUps += event.followUpQueries.length;
        if (event.followUpQueries.length > 0) {
          log(
            palette.dim(
              `  ↳ coverage round ${event.round}: ${event.followUpQueries.length} follow-up search${event.followUpQueries.length === 1 ? "" : "es"}`,
            ),
          );
        }
        break;
      case "report.completed":
        tracked.words = event.report.wordCount;
        tracked.citations = event.report.citationCount;
        break;
      case "audit.completed":
        log(
          `  ${palette.green("✓")} Audit ${palette.bold(String(event.audit.score))}/100 ${palette.dim(`· ${Math.round(event.audit.citationCoverage * 100)}% citation coverage · ${event.audit.verdict}`)}`,
        );
        break;
      case "revision.started":
        log(palette.dim(`  ↳ revising draft: ${event.reason}`));
        break;
      case "run.completed":
        break;
      default:
        break;
    }
    if (event.type === "phase.completed") {
      const elapsed = formatDuration(Date.now() - tracked.phaseStart);
      if (!options.verbose) {
        if (event.phase === "scope") phaseLine("Scope", "questions and search plan ready", elapsed);
        else if (event.phase === "discover") {
          phaseLine(
            "Discovery",
            `${tracked.searches} searches · ${tracked.found} sources found${tracked.followUps > 0 ? ` · ${tracked.followUps} follow-ups` : ""}`,
            elapsed,
          );
        } else if (event.phase === "read") {
          phaseLine("Reading", `${tracked.read} read · ${tracked.failed} skipped`, elapsed);
        } else if (event.phase === "write") {
          phaseLine("Draft", `${tracked.words} words · ${tracked.citations} citations`, elapsed);
        }
      } else if (event.phase === "audit") {
        log(palette.dim(`  ✓ ${event.phase} · ${elapsed}`));
      }
    }
  };

  log(`  ${palette.dim("────────────────────────────────────────────────────────────")}`);

  try {
    result = await runResearch(
      {
        query: options.query,
        depth: options.depth,
        ...(options.language ? { language: options.language } : {}),
        ...(options.audience ? { audience: options.audience } : {}),
      },
      {
        provider: runtime.provider,
        search: runtime.search,
        fetcher: runtime.fetcher,
        demo: runtime.demo,
        pricing: runtime.pricing,
        logger,
        signal,
        onEvent,
      },
    );
  } catch (error) {
    if (isAbortError(error)) {
      process.stderr.write(`${palette.yellow("Cancelled.")}\n`);
      return 130;
    }
    const label = isTimeoutError(error) ? "Timed out" : "Run failed";
    const code = error instanceof HarnessError ? palette.dim(` [${error.code}]`) : "";
    process.stderr.write(`${palette.red(label)} ${errorMessage(error)}${code}\n`);
    return 1;
  } finally {
    clearTimeout(timeoutTimer);
    process.removeListener("SIGINT", onSigint);
  }

  const markdown = appendSourceLedger(result.report.markdown, result.sources);
  const elapsed = Date.now() - startedAt;

  if (options.out) {
    const target = resolve(process.cwd(), options.out);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, markdown, "utf8");
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (!options.out) {
    process.stdout.write(markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  }

  if (!options.quiet) {
    const stats = result.stats;
    log();
    log(
      `  ${palette.green("●")} ${palette.bold("Complete")} ${palette.dim("·")} ${formatDuration(elapsed)} ${palette.dim("·")} ${stats.read} sources ${palette.dim("·")} ${result.report.citationCount} citations ${palette.dim("·")} ${formatTokens(stats.usage.totalTokens)} tokens ${palette.dim("·")} ${formatCost(stats.estimatedCostUsd)}`,
    );
    if (options.out) log(`  ${palette.dim("brief")} ${resolve(process.cwd(), options.out)}`);
    else if (options.json) log(`  ${palette.dim("result")} JSON written to stdout`);
    else log(`  ${palette.dim("brief")} Markdown written to stdout`);
    log();
  }

  return 0;
}

function formatData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return "";
  const parts = Object.entries(data)
    .slice(0, 3)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
  return ` (${parts.join(", ")})`;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`Unexpected error: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  });
