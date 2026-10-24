import type { CitationRef, ResearchBrief, SourceDocument } from "./types";
import { HarnessError } from "./util/errors";
import { estimateTokens, jaccard, keywordScore, splitParagraphs, truncate } from "./util/text";

export interface EvidenceSelection {
  text: string;
  citations: CitationRef[];
  sources: SourceDocument[];
  tokens: number;
}

interface Passage {
  source: SourceDocument;
  text: string;
  score: number;
}

function passagesFor(document: SourceDocument): string[] {
  const chunks = splitParagraphs(document.text);
  const output: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= 1_400) {
      output.push(chunk);
      continue;
    }
    const sentences = chunk.match(/[^.!?。！？]+[.!?。！？]+/g) ?? [chunk];
    let current = "";
    for (const sentence of sentences) {
      if (current.length + sentence.length > 1_100 && current) {
        output.push(current.trim());
        current = "";
      }
      current += sentence;
    }
    if (current.trim()) output.push(current.trim());
  }
  return output;
}

export function buildEvidenceContext(
  documents: SourceDocument[],
  brief: ResearchBrief,
  budgetTokens: number,
): EvidenceSelection {
  if (documents.length === 0) {
    throw new HarnessError(
      "NO_SOURCES",
      "No readable sources were found. Try a more specific query or configure a search API key.",
    );
  }

  const focus = [
    brief.restated,
    ...brief.subquestions.map((item) => item.question),
    ...brief.queries.map((item) => item.query),
  ].join("\n");

  const passages: Passage[] = [];
  for (const document of documents) {
    for (const text of passagesFor(document)) {
      if (text.length < 80) continue;
      const relevance = keywordScore(focus, text);
      const lengthScore = Math.min(1, text.length / 1_000);
      passages.push({
        source: document,
        text: truncate(text, 1_200),
        score: relevance * 0.7 + lengthScore * 0.1 + document.source.score * 0.2,
      });
    }
  }

  passages.sort((a, b) => b.score - a.score);

  const selected: Array<{ document: SourceDocument; texts: string[] }> = [];
  const seenPassages: string[] = [];
  const perSource = new Map<string, number>();

  for (const passage of passages) {
    if (perSource.get(passage.source.source.id) === 2) continue;
    if (perSource.size >= 10 && !perSource.has(passage.source.source.id)) continue;
    if (seenPassages.some((existing) => jaccard(existing, passage.text) > 0.72)) continue;

    let group = selected.find((item) => item.document.source.id === passage.source.source.id);
    if (!group) {
      group = { document: passage.source, texts: [] };
      selected.push(group);
    }
    group.texts.push(passage.text);
    seenPassages.push(passage.text);
    perSource.set(passage.source.source.id, group.texts.length);
  }

  const citations: CitationRef[] = [];
  const chosen: Array<{ document: SourceDocument; text: string; number: number }> = [];
  let totalTokens = 0;

  for (const group of selected.slice(0, 10)) {
    const number = citations.length + 1;
    const header = `[${number}] ${group.document.source.title}\nDomain: ${group.document.source.domain}${
      group.document.source.publishedAt
        ? ` · Published: ${group.document.source.publishedAt.slice(0, 10)}`
        : ""
    }\nURL: ${group.document.source.url}\nExcerpt:`;
    let block = `${header}\n${group.texts.join("\n\n")}\n`;
    let tokens = estimateTokens(block);

    if (totalTokens + tokens > budgetTokens) {
      const remaining = budgetTokens - totalTokens;
      if (remaining < 220) break;
      block = truncate(block, remaining * 4);
      tokens = estimateTokens(block);
    }

    if (totalTokens + tokens > budgetTokens) break;

    citations.push({ number, sourceId: group.document.source.id });
    chosen.push({ document: group.document, text: block, number });
    totalTokens += tokens;
  }

  if (chosen.length === 0) {
    throw new HarnessError(
      "NO_SOURCES",
      "The sources that were fetched did not contain enough usable text. Try another query.",
    );
  }

  return {
    text: chosen.map((item) => item.text).join("\n"),
    citations,
    sources: chosen.map((item) => item.document),
    tokens: totalTokens,
  };
}
