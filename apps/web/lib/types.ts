import type {
  Depth,
  HarnessEvent,
  Phase,
  ResearchResult,
  RunStats,
  StoredEvent,
} from "@dossier/harness";

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface RunRecord {
  id: string;
  query: string;
  depth: Depth;
  language: string | null;
  status: RunStatus;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  title: string | null;
  report: string | null;
  result: ResearchResult | null;
  error: string | null;
  errorCode: string | null;
  stats: RunStats | null;
  model: string;
  demo: boolean;
}

export interface RunSummary {
  id: string;
  query: string;
  title: string | null;
  status: RunStatus;
  depth: Depth;
  createdAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  sourceCount: number;
  model: string;
  demo: boolean;
}

export interface RunView extends RunRecord {
  partialReport: string;
  currentPhase: Phase | null;
}

export interface CreateRunInput {
  query: string;
  depth: Depth;
  language?: string;
  audience?: string;
  recencyDays?: number;
}

export interface PublicConfig {
  demo: boolean;
  demoReason: "forced" | "no_api_key" | null;
  model: string;
  searchLabel: string;
  searchProviders: string[];
  version: string;
  maxConcurrentRuns: number;
  limits: Array<{
    depth: Depth;
    label: string;
    maxSources: number;
    maxReads: number;
    timeoutMs: number;
  }>;
}

export type StoredHarnessEvent = StoredEvent<HarnessEvent>;

export interface RunTraceSummary {
  id: string;
  query: string;
  title: string | null;
  status: RunStatus;
  depth: Depth;
  language: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  model: string;
  demo: boolean;
  stats: RunStats | null;
}

export interface RunTraceResponse {
  run: RunTraceSummary;
  events: StoredHarnessEvent[];
  total: number;
  truncated: boolean;
}
