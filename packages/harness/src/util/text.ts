const CJK = /[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/g;
const WORD = /[a-z0-9][a-z0-9'’-]*/gi;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "how",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
]);

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjkCount = text.match(CJK)?.length ?? 0;
  const remainder = text.length - cjkCount;
  return Math.ceil(cjkCount + remainder / 4);
}

export function wordCount(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const latin = text.match(WORD)?.length ?? 0;
  return cjk + latin;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(WORD) ?? []).filter(
    (word) => word.length > 1 && !STOPWORDS.has(word),
  );
}

export function keywordScore(query: string, text: string): number {
  const queryTerms = Array.from(new Set(tokenize(query)));
  if (queryTerms.length === 0) return 0;
  const haystack = new Set(tokenize(text));
  let matches = 0;
  for (const term of queryTerms) {
    if (haystack.has(term)) matches += 1;
  }
  return matches / queryTerms.length;
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？])\s*|(?<=[.!?])\s+(?=[A-Z0-9"'“（(])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[ \t]+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 40);
}

export function cleanText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const boundary = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("。"),
    slice.lastIndexOf("\n"),
  );
  return `${slice.slice(0, boundary > maxChars * 0.6 ? boundary + 1 : maxChars).trim()}…`;
}

export function jaccard(a: string, b: string): number {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const term of left) {
    if (right.has(term)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()#>]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
