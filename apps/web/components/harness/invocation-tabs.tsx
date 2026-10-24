"use client";

import { Check, Copy, Terminal } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

const SNIPPETS = {
  embed: {
    label: "TypeScript",
    file: "example.ts",
    note: "The same call runs inside the web app’s /api/runs route.",
    code: `import {
  createRuntimeFromEnv,
  runResearch,
} from "@dossier/harness";

const runtime = createRuntimeFromEnv(process.env);

const result = await runResearch(
  {
    query: "What does the evidence say about a four-day work week?",
    depth: "standard",
  },
  {
    provider: runtime.provider,
    search: runtime.search,
    fetcher: runtime.fetcher,
    pricing: runtime.pricing,
    onEvent: (event) => console.log(event.type),
  },
);

console.log(result.report.markdown);
console.log(result.audit.score);`,
  },
  http: {
    label: "HTTP",
    file: "POST /api/runs",
    note: "Stream GET /api/runs/:id/events as SSE. Reconnect with Last-Event-ID or ?after=.",
    code: `# Start a run
curl -s http://localhost:3000/api/runs \\
  -H 'content-type: application/json' \\
  -d '{"query":"What does the evidence say about a four-day work week?","depth":"quick"}'

# → { "id": "r_...", "status": "queued", "demo": true }
# Follow the typed event stream
curl -N http://localhost:3000/api/runs/r_.../events

# Inspect the persisted trace as JSON
curl -s http://localhost:3000/api/runs/r_.../trace`,
  },
  cli: {
    label: "CLI",
    file: "terminal",
    note: "Progress goes to stderr; the brief goes to stdout. --json emits the full record.",
    code: `# A complete brief on stdout
npm run --silent cli -- \\
  "What does the evidence say about a four-day work week?" \\
  --depth standard > brief.md

# Inspect what the harness did
npm run cli -- "..." --depth quick --verbose

# Machine-readable run record
npm run --silent cli -- "..." --json > run.json`,
  },
} as const;

type SnippetKey = keyof typeof SNIPPETS;

export function InvocationTabs() {
  const [active, setActive] = useState<SnippetKey>("embed");
  const [copied, setCopied] = useState(false);
  const snippet = SNIPPETS[active];

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(snippet.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_800);
    } catch {
      // Clipboard access can be blocked; the code remains selectable.
    }
  }

  return (
    <div className="min-w-0 border border-line bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex items-center gap-1" role="tablist" aria-label="Harness invocation">
          {(Object.keys(SNIPPETS) as SnippetKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active === key}
              onClick={() => setActive(key)}
              className={cn(
                "rounded-full px-3 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em] transition-colors",
                active === key ? "bg-ink text-paper" : "text-muted hover:bg-paper-2 hover:text-ink",
              )}
            >
              {SNIPPETS[key].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-[0.5rem] uppercase tracking-[0.08em] text-faint sm:inline">
            {snippet.file}
          </span>
          <button
            type="button"
            onClick={() => void copyCode()}
            className="btn btn-sm btn-quiet !h-7 !px-2"
            aria-label="Copy code"
          >
            {copied ? (
              <Check className="size-3.5 text-moss" strokeWidth={2} />
            ) : (
              <Copy className="size-3.5" strokeWidth={1.8} />
            )}
          </button>
        </div>
      </div>

      <div className="bg-[#14120e] text-[#d9cfba]">
        <pre className="overflow-x-auto p-5 font-mono text-[0.6875rem] leading-[1.8]">
          <code>{snippet.code}</code>
        </pre>
      </div>

      <div className="flex items-start gap-2 border-t border-line px-4 py-3">
        <Terminal className="mt-0.5 size-3 flex-none text-accent" strokeWidth={1.7} />
        <p className="text-[0.6875rem] leading-relaxed text-muted">{snippet.note}</p>
      </div>
    </div>
  );
}
