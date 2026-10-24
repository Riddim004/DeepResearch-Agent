import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import type { ResearchResult, RunStats } from "@dossier/harness";
import type { CreateRunInput, RunRecord, RunStatus, RunSummary, StoredHarnessEvent } from "./types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  depth TEXT NOT NULL,
  language TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  title TEXT,
  report TEXT,
  result_json TEXT,
  error TEXT,
  error_code TEXT,
  stats_json TEXT,
  model TEXT NOT NULL,
  demo INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (run_id, seq),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_run_seq ON events(run_id, seq);
`;

interface RunRow {
  id: string;
  query: string;
  depth: string;
  language: string | null;
  status: string;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  title: string | null;
  report: string | null;
  result_json: string | null;
  error: string | null;
  error_code: string | null;
  stats_json: string | null;
  model: string;
  demo: number;
  source_count: number;
  duration_ms: number | null;
}

interface EventRow {
  seq: number;
  ts: number;
  type: string;
  data: string;
}

interface SummaryRow {
  id: string;
  query: string;
  title: string | null;
  status: string;
  depth: string;
  created_at: number;
  finished_at: number | null;
  duration_ms: number | null;
  source_count: number;
  model: string;
  demo: number;
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toRecord(row: RunRow): RunRecord {
  return {
    id: row.id,
    query: row.query,
    depth: row.depth as RunRecord["depth"],
    language: row.language,
    status: row.status as RunStatus,
    createdAt: Number(row.created_at),
    startedAt: row.started_at === null ? null : Number(row.started_at),
    finishedAt: row.finished_at === null ? null : Number(row.finished_at),
    title: row.title,
    report: row.report,
    result: parseJson<ResearchResult>(row.result_json),
    error: row.error,
    errorCode: row.error_code,
    stats: parseJson<RunStats>(row.stats_json),
    model: row.model,
    demo: row.demo === 1,
  };
}

export class RunStore {
  private readonly db: DatabaseSync;
  private readonly insertEvent: StatementSync;
  private readonly readEvents: StatementSync;

  constructor() {
    const dataDir = process.env.DOSSIER_DATA_DIR ?? path.join(process.cwd(), ".data");
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, "dossier.sqlite"));
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec(SCHEMA);

    const now = Date.now();
    this.db
      .prepare(
        `UPDATE runs
         SET status = 'failed',
             error = 'The server restarted before this run finished.',
             error_code = 'INTERRUPTED',
             finished_at = ?
         WHERE status IN ('queued', 'running')`,
      )
      .run(now);

    this.insertEvent = this.db.prepare(
      "INSERT OR REPLACE INTO events (run_id, seq, ts, type, data) VALUES (?, ?, ?, ?, ?)",
    );
    this.readEvents = this.db.prepare(
      "SELECT seq, ts, type, data FROM events WHERE run_id = ? AND seq > ? ORDER BY seq ASC",
    );
  }

  createRun(input: {
    id: string;
    request: CreateRunInput;
    model: string;
    demo: boolean;
  }): RunRecord {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO runs (id, query, depth, language, status, created_at, model, demo)
         VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)`,
      )
      .run(
        input.id,
        input.request.query,
        input.request.depth,
        input.request.language ?? null,
        now,
        input.model,
        input.demo ? 1 : 0,
      );

    return {
      id: input.id,
      query: input.request.query,
      depth: input.request.depth,
      language: input.request.language ?? null,
      status: "queued",
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      title: null,
      report: null,
      result: null,
      error: null,
      errorCode: null,
      stats: null,
      model: input.model,
      demo: input.demo,
    };
  }

  markRunning(id: string, startedAt: number): void {
    this.db
      .prepare("UPDATE runs SET status = 'running', started_at = ? WHERE id = ?")
      .run(startedAt, id);
  }

  completeRun(input: {
    id: string;
    title: string;
    report: string;
    result: ResearchResult;
    stats: RunStats;
    sourceCount: number;
    finishedAt: number;
  }): void {
    this.db
      .prepare(
        `UPDATE runs
         SET status = 'completed', finished_at = ?, title = ?, report = ?,
             result_json = ?, stats_json = ?, source_count = ?, duration_ms = ?
         WHERE id = ?`,
      )
      .run(
        input.finishedAt,
        input.title,
        input.report,
        JSON.stringify(input.result),
        JSON.stringify(input.stats),
        input.sourceCount,
        input.stats.durationMs,
        input.id,
      );
  }

  failRun(input: {
    id: string;
    status: "failed" | "cancelled";
    error: string;
    errorCode: string;
    finishedAt: number;
    startedAt: number | null;
  }): void {
    const duration = input.startedAt ? input.finishedAt - input.startedAt : null;
    this.db
      .prepare(
        `UPDATE runs
         SET status = ?, finished_at = ?, error = ?, error_code = ?, duration_ms = ?
         WHERE id = ?`,
      )
      .run(input.status, input.finishedAt, input.error, input.errorCode, duration, input.id);
  }

  appendEvent(runId: string, event: StoredHarnessEvent): void {
    this.insertEvent.run(runId, event.seq, event.ts, event.type, JSON.stringify(event.data));
  }

  listEvents(runId: string, afterSeq = 0): StoredHarnessEvent[] {
    const rows = this.readEvents.all(runId, afterSeq) as unknown as EventRow[];
    const events: StoredHarnessEvent[] = [];
    for (const row of rows) {
      const data = parseJson<StoredHarnessEvent["data"]>(row.data);
      if (!data) continue;
      events.push({
        seq: Number(row.seq),
        ts: Number(row.ts),
        type: row.type as StoredHarnessEvent["type"],
        data,
      });
    }
    return events;
  }

  getRun(id: string): RunRecord | null {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
    return row ? toRecord(row) : null;
  }

  listRuns(limit = 30): RunSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, query, title, status, depth, created_at, finished_at, duration_ms,
                source_count, model, demo
         FROM runs ORDER BY created_at DESC LIMIT ?`,
      )
      .all(Math.max(1, Math.min(100, limit))) as unknown as SummaryRow[];

    return rows.map((row) => ({
      id: row.id,
      query: row.query,
      title: row.title,
      status: row.status as RunStatus,
      depth: row.depth as RunSummary["depth"],
      createdAt: Number(row.created_at),
      finishedAt: row.finished_at === null ? null : Number(row.finished_at),
      durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
      sourceCount: Number(row.source_count),
      model: row.model,
      demo: row.demo === 1,
    }));
  }

  countRuns(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM runs").get() as
      { count: number } | undefined;
    return Number(row?.count ?? 0);
  }
}

const globalForStore = globalThis as unknown as { __dossierStore?: RunStore };

export function getStore(): RunStore {
  if (!globalForStore.__dossierStore) {
    globalForStore.__dossierStore = new RunStore();
  }
  return globalForStore.__dossierStore;
}
