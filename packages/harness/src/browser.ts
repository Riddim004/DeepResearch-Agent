export {
  appendSourceLedger,
  citationStats,
  extractTitle,
  linkifyCitations,
  normalizeReportMarkdown,
  sanitizeCitations,
} from "./citations";
export { estimateTokens, slugify, wordCount } from "./util/text";
export { domainOf, normalizeUrl } from "./util/url";

export type {
  AuditIssue,
  AuditResult,
  CitationRef,
  Depth,
  HarnessEvent,
  Phase,
  ReportArtifact,
  ResearchBrief,
  ResearchResult,
  RunStats,
  Source,
  SourceStatus,
  StoredEvent,
} from "./types";
