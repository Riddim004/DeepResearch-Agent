# Harness guide

`@dossier/harness` is the reusable core behind the Dossier web app and CLI. This guide covers embedding it, extending it, and testing it.

## Install / import

Inside the monorepo the package is exported from TypeScript source:

```ts
import { createRuntimeFromEnv, runResearch, type HarnessEvent } from "@dossier/harness";
```

For a standalone project, copy `packages/harness` or add it as a workspace package. It is intentionally not published to npm yet; the browser-safe surface is exported as `@dossier/harness/browser` so client components never pull in `jsdom`, `unpdf`, or `node:sqlite`.

## Minimal run

```ts
import { createRuntimeFromEnv, runResearch } from "@dossier/harness";

const runtime = createRuntimeFromEnv(process.env);

const result = await runResearch(
  {
    query: "What does the evidence say about a four-day work week?",
    depth: "standard", // quick | standard | deep
    language: "en", // optional output language
  },
  {
    provider: runtime.provider,
    search: runtime.search,
    fetcher: runtime.fetcher,
    pricing: runtime.pricing,
    onEvent: (event) => {
      if (event.type === "source.read") console.log("read", event.source.domain);
      if (event.type === "report.delta") process.stdout.write(event.text);
    },
  },
);
```

`runResearch` resolves with:

```ts
interface ResearchResult {
  brief: ResearchBrief;
  report: ReportArtifact; // title, markdown, wordCount, citationCount, revision
  sources: Source[];
  citations: CitationRef[];
  audit: AuditResult; // score, coverage, issues, verdict
  stats: RunStats; // duration, searches, reads, usage, cost
}
```

Errors are `HarnessError` with a stable `code`: `INVALID_INPUT`, `PROVIDER_AUTH`, `PROVIDER_RATE_LIMIT`, `PROVIDER_ERROR`, `SEARCH_FAILED`, `NO_SOURCES`, `TIMEOUT`, `CANCELLED`, `INTERNAL`. Abort errors are also detectable with `isAbortError`.

## Adapter contracts

Every dependency is an interface in [`src/types.ts`](../packages/harness/src/types.ts).

### ModelProvider

```ts
interface ModelProvider {
  readonly id: string;
  readonly model: string;
  readonly demo?: boolean;
  stream(request: CompletionRequest): AsyncIterable<ModelStreamEvent>;
}
```

The stream must emit zero or more `text`/`reasoning` events, then exactly one `usage` event, then a `done` event. `MockProvider` and `OpenAICompatibleProvider` are the reference implementations. The pipeline relies on `usage` for cost and stats; a provider that never emits it still works but reports zero tokens.

Task kinds are `plan`, `followup`, `report`, `revise`, and `audit`. A provider may use `request.metadata` to specialize behavior (the demo provider does).

### SearchProvider

```ts
interface SearchProvider {
  readonly id: string;
  readonly label: string;
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
}
```

Return normalized absolute URLs. `options.maxResults` is a cap, not a requirement. Throw `SearchProviderError` for a provider-level failure; the merged provider tolerates partial failure.

```ts
class MySearchProvider implements SearchProvider {
  readonly id = "my-search";
  readonly label = "My Search";

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const response = await fetch(`https://api.example.com/search?q=${encodeURIComponent(query)}`, {
      signal: options.signal,
    });
    const data = await response.json();
    return data.results.slice(0, options.maxResults).map((item: any, index: number) => ({
      title: item.title,
      url: item.url,
      snippet: item.snippet ?? "",
      provider: this.id,
      rank: index + 1,
    }));
  }
}
```

### PageFetcher

```ts
interface PageFetcher {
  fetch(url: string, options?: { signal?: AbortSignal }): Promise<FetchedPage>;
}
```

`PageReader` is the production implementation with SSRF protection and extraction. If you supply your own fetcher, you own URL safety.

## Runtime assembly

`createRuntimeFromEnv(env)` picks:

- a model provider: OpenAI-compatible when a key exists, otherwise the demo writer;
- a search stack: configured paid provider or DuckDuckGo, with a free fallback;
- a guarded page reader;
- optional pricing for cost estimates.

You can bypass it entirely and pass your own adapters to `runResearch`.

## Events

| Event                                                                      | Payload highlights              |
| -------------------------------------------------------------------------- | ------------------------------- |
| `run.started`                                                              | query, depth, model, demo       |
| `phase.started` / `phase.completed`                                        | phase, duration                 |
| `plan.created`                                                             | full `ResearchBrief`            |
| `search.started` / `search.completed` / `search.failed`                    | query, counts, duration, error  |
| `source.found`                                                             | full `Source`                   |
| `source.reading` / `source.read` / `source.failed`                         | source id/title, source, error  |
| `coverage.assessed`                                                        | round, gaps, follow-up queries  |
| `context.built`                                                            | citations, tokens, source count |
| `report.started` / `report.delta` / `report.snapshot` / `report.completed` | revision, text, artifact        |
| `audit.started` / `audit.completed`                                        | audit result                    |
| `revision.started`                                                         | reason                          |
| `run.completed` / `run.failed` / `run.cancelled`                           | stats, error/code               |
| `log`                                                                      | level, message                  |

Treat `onEvent` as a sink: do not throw, and keep expensive work off the hot path. The pipeline guards against throwing sinks, but they will be logged as warnings.

## CLI

The CLI is a thin adapter; see [`apps/cli/src/index.ts`](../apps/cli/src/index.ts).

```bash
npm run cli -- "your question" --depth standard --out brief.md
```

Progress is written to stderr and the final Markdown to stdout, so `npm run --silent cli -- "..." > brief.md` yields a clean document. `--json` prints the full result instead.

## Testing with fixtures

The harness ships a deterministic corpus:

```ts
import {
  FIXTURE_QUERY,
  FixturePageFetcher,
  FixtureSearchProvider,
  MockProvider,
  runResearch,
} from "@dossier/harness";

const result = await runResearch(
  { query: FIXTURE_QUERY, depth: "quick" },
  {
    provider: new MockProvider({ delayMs: 0 }),
    search: new FixtureSearchProvider(),
    fetcher: new FixturePageFetcher(),
    demo: true,
    onEvent: () => undefined,
  },
);
```

This is the pattern used by the pipeline tests: no network, no API key, real pipeline code.

## Evaluation

The benchmark is part of the package, not a script around it:

```ts
import { runEvaluation } from "@dossier/harness";

const report = await runEvaluation();
// report.summary: passRate, citationCoverage, auditScore, authorityScore, grade
```

`npm run eval` calls the same function and writes `evals/latest.json`. Cases live in [`src/evaluation/cases.ts`](../packages/harness/src/evaluation/cases.ts); fixtures are an offline English and Chinese corpus. Fault injection covers search outages, read outages, thin evidence, and an uncited first draft that must trigger exactly one revision. Source authority is classified by [`domainTier()`](../packages/harness/src/source-tier.ts) into S/A/B/C and weighted in the composite score. See [evaluation.md](evaluation.md) for the rubric and limitations.

## Extension points

- **New search source:** implement `SearchProvider`, add it to `createRuntimeFromEnv` or a `MergedSearchProvider`.
- **New model vendor:** implement `ModelProvider`; OpenAI-compatible endpoints usually only need configuration.
- **Different extraction:** implement `PageFetcher` and keep the rest of the pipeline.
- **Different persistence:** consume `HarnessEvent` and `ResearchResult`; nothing in the harness depends on Next.js or SQLite.
- **Custom UI:** the event union is the contract; the web desk is one renderer, not the only possible one. The `/harness` console is a second, developer-facing renderer over the same persisted trace.

## Operational notes

- The harness never writes to disk; persistence belongs to the host application.
- Each run is independent; there is no shared mutable state between runs except provider/fetcher instances.
- Provider retries and rate-limit backoff live in `OpenAICompatibleProvider`, not the pipeline.
- The demo writer uses the same evidence context as a real model, so citation plumbing can be tested without a key.
