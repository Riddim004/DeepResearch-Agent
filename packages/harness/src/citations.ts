import type { Source } from "./types";
import { splitSentences, wordCount } from "./util/text";

const MARKER = /\[(\d{1,3}(?:\s*[,，]\s*\d{1,3})*)\](?!\s*[:(])/g;

interface TransformResult {
  text: string;
  removed: number[];
}

function transformOutsideCode(
  markdown: string,
  transform: (line: string) => TransformResult,
): TransformResult {
  const lines = markdown.split("\n");
  let fenced = false;
  const removed: number[] = [];
  const output: string[] = [];

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      output.push(line);
      continue;
    }
    if (fenced) {
      output.push(line);
      continue;
    }
    const parts = line.split(/(`[^`]*`)/g);
    const rebuilt = parts
      .map((part) => {
        if (part.startsWith("`") && part.endsWith("`")) return part;
        const result = transform(part);
        removed.push(...result.removed);
        return result.text;
      })
      .join("");
    output.push(rebuilt);
  }

  return { text: output.join("\n"), removed };
}

export function linkifyCitations(markdown: string, validNumbers: Set<number>): string {
  return transformOutsideCode(markdown, (line) => {
    let text = "";
    let lastIndex = 0;
    for (const match of line.matchAll(MARKER)) {
      const index = match.index ?? 0;
      const before = line[index - 1];
      if (before === "!" || before === "[") continue;
      const numbers = (match[1] ?? "")
        .split(/[,，]/)
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && validNumbers.has(value));
      text += line.slice(lastIndex, index);
      if (numbers.length > 0) {
        text += numbers.map((number) => `[${number}](cite:${number})`).join("");
      } else {
        text += match[0];
      }
      lastIndex = index + match[0].length;
    }
    text += line.slice(lastIndex);
    return { text, removed: [] };
  }).text;
}

export function sanitizeCitations(markdown: string, validNumbers: Set<number>): TransformResult {
  return transformOutsideCode(markdown, (line) => {
    let text = "";
    let lastIndex = 0;
    const removed: number[] = [];
    for (const match of line.matchAll(MARKER)) {
      const index = match.index ?? 0;
      const before = line[index - 1];
      if (before === "!" || before === "[") continue;
      const numbers = (match[1] ?? "")
        .split(/[,，]/)
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value));
      const valid = numbers.filter((number) => validNumbers.has(number));
      const invalid = numbers.filter((number) => !validNumbers.has(number));
      removed.push(...invalid);
      text += line.slice(lastIndex, index);
      if (valid.length > 0) {
        text += `[${Array.from(new Set(valid)).join(", ")}]`;
      }
      lastIndex = index + match[0].length;
    }
    text += line.slice(lastIndex);
    return { text, removed };
  });
}

export function citationStats(markdown: string): {
  sentences: number;
  citedSentences: number;
  coverage: number;
  citationCount: number;
  numbers: number[];
} {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
  const withoutLedger = withoutCode.split(/^##\s+(sources|references|bibliography)\s*$/im)[0] ?? "";
  const lines = withoutLedger
    .split("\n")
    .filter((line) => !/^\s*#{1,6}\s/.test(line))
    .filter((line) => !/^\s*\|?[\s:-]+\|/.test(line))
    .join("\n");
  const sentences = splitSentences(lines).filter((sentence) => wordCount(sentence) >= 5);
  const numbers = new Set<number>();
  let cited = 0;

  for (const sentence of sentences) {
    let hasCitation = false;
    for (const match of sentence.matchAll(/\[(\d{1,3}(?:\s*[,，]\s*\d{1,3})*)\]/g)) {
      for (const value of (match[1] ?? "").split(/[,，]/)) {
        const number = Number(value.trim());
        if (Number.isInteger(number) && number > 0) {
          numbers.add(number);
          hasCitation = true;
        }
      }
    }
    if (hasCitation) cited += 1;
  }

  return {
    sentences: sentences.length,
    citedSentences: cited,
    coverage: sentences.length === 0 ? 0 : cited / sentences.length,
    citationCount: numbers.size,
    numbers: Array.from(numbers).sort((a, b) => a - b),
  };
}

export function extractTitle(markdown: string): string | null {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match?.[1]?.trim() ?? null;
}

export function normalizeReportMarkdown(markdown: string, fallbackTitle: string): string {
  let text = markdown.trim();
  const fence = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(text);
  if (fence?.[1]) text = fence[1].trim();
  if (!/^#\s+/.test(text)) text = `# ${fallbackTitle}\n\n${text}`;
  return `${text.trim()}\n`;
}

export function appendSourceLedger(markdown: string, sources: Source[]): string {
  if (/^##\s+(sources|references|bibliography)\s*$/im.test(markdown)) return markdown;
  const numbered = sources
    .filter((source) => source.number !== null)
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  if (numbered.length === 0) return markdown;

  const items = numbered.map((source) => {
    const title = source.title.replace(/]/g, "\\]").replace(/\n/g, " ");
    return `${source.number}. [${title}](${source.url}) — ${source.domain}`;
  });

  return `${markdown.trimEnd()}\n\n---\n\n## Sources\n\n${items.join("\n")}\n`;
}
