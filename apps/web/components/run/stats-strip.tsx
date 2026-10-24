import type { RunStats } from "@dossier/harness/browser";

import { formatDuration, formatNumber } from "@/lib/utils";

export function StatsStrip({
  stats,
  citationCount,
  demo,
}: {
  stats: RunStats;
  citationCount: number;
  demo: boolean;
}) {
  const items = [
    ["Duration", formatDuration(stats.durationMs)],
    ["Sources", `${stats.read} read / ${stats.found} found`],
    ["Citations", String(citationCount)],
    ["Tokens", formatNumber(stats.usage.totalTokens)],
    ["Searches", String(stats.searches)],
    ["Model", demo ? "Demo writer" : stats.model],
  ];

  return (
    <div className="mt-10 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0 bg-paper-2 px-3 py-3">
          <span className="font-mono text-[0.5rem] uppercase tracking-[0.12em] text-faint">
            {label}
          </span>
          <span className="mt-1 block truncate font-mono text-[0.6875rem] text-ink-2" title={value}>
            {value}
          </span>
        </div>
      ))}
      {stats.estimatedCostUsd !== null && (
        <div className="bg-paper-2 px-3 py-3">
          <span className="font-mono text-[0.5rem] uppercase tracking-[0.12em] text-faint">
            Est. cost
          </span>
          <span className="mt-1 block font-mono text-[0.6875rem] text-ink-2">
            ${stats.estimatedCostUsd.toFixed(3)}
          </span>
        </div>
      )}
    </div>
  );
}
