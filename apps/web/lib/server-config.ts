import { DEPTH_PROFILES, createRuntimeFromEnv, type DossierRuntime } from "@dossier/harness";
import { serverLogger } from "./logger";
import type { PublicConfig } from "./types";

const globalForRuntime = globalThis as unknown as { __dossierRuntime?: DossierRuntime };

export function getRuntime(): DossierRuntime {
  if (!globalForRuntime.__dossierRuntime) {
    globalForRuntime.__dossierRuntime = createRuntimeFromEnv(process.env, { logger: serverLogger });
  }
  return globalForRuntime.__dossierRuntime;
}

export const MAX_CONCURRENT_RUNS = 3;

export function getPublicConfig(): PublicConfig {
  const runtime = getRuntime();
  return {
    demo: runtime.demo,
    demoReason: runtime.demoReason,
    model: runtime.model,
    searchLabel: runtime.searchLabel,
    searchProviders: runtime.searchProviders,
    version: "0.1.0",
    maxConcurrentRuns: MAX_CONCURRENT_RUNS,
    limits: Object.values(DEPTH_PROFILES).map((profile) => ({
      depth: profile.name,
      label: profile.label,
      maxSources: profile.maxSources,
      maxReads: profile.maxReads,
      timeoutMs: profile.timeoutMs,
    })),
  };
}
