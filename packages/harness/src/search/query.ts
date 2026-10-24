import { tokenize } from "../util/text";

const CJK = /[\u3000-\u9fff]/;

const EXTRA_STOPWORDS = new Set([
  "about",
  "actually",
  "analysis",
  "better",
  "case",
  "criticism",
  "criticisms",
  "data",
  "evaluation",
  "evidence",
  "explain",
  "explained",
  "good",
  "independent",
  "latest",
  "limitation",
  "limitations",
  "map",
  "overview",
  "policy",
  "recent",
  "regulation",
  "really",
  "say",
  "says",
  "said",
  "state",
  "study",
  "studies",
]);

const STOPWORD_SET = new Set(Array.from(EXTRA_STOPWORDS));
const TECHNICAL =
  /(^|\b)(ai|artificial intelligence|machine learning|llm|language model|agent|algorithm|robot|robotics|battery|energy storage|grid storage|physics|quantum|semiconductor|neural network|protein|genome|gene|climate|emissions)(\b|$)/i;

export function isCjkQuery(query: string): boolean {
  return CJK.test(query);
}

export function keywordQuery(query: string, maxTerms = 8): string {
  if (CJK.test(query)) {
    return query
      .replace(/[?？.。!！,，;；:：、"'“”‘’()（）[\]【】]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  const terms = tokenize(query).filter((term) => !EXTRA_STOPWORDS.has(term));
  return terms.slice(0, maxTerms).join(" ") || query.trim().slice(0, 120);
}

export function isTechnicalQuery(query: string): boolean {
  return TECHNICAL.test(query);
}

function canonical(term: string): string {
  let value = term.replace(/’s$|'s$/, "");
  if (value.length > 4 && value.endsWith("ies")) value = `${value.slice(0, -3)}y`;
  else if (value.length > 4 && value.endsWith("es")) value = value.slice(0, -2);
  else if (value.length > 3 && value.endsWith("s")) value = value.slice(0, -1);
  return value;
}

function matchesAnchor(anchor: string, haystack: Set<string>): boolean {
  if (haystack.has(canonical(anchor))) return true;
  const parts = anchor.split("-").filter((part) => part.length > 1);
  return parts.length > 1 && parts.every((part) => haystack.has(canonical(part)));
}

export function queryAnchors(query: string, maxTerms = 8): string[] {
  if (CJK.test(query)) return [];
  const seen = new Set<string>();
  const anchors: string[] = [];
  for (const term of tokenize(query)) {
    if (STOPWORD_SET.has(term) || seen.has(term)) continue;
    seen.add(term);
    anchors.push(term);
    if (anchors.length >= maxTerms) break;
  }
  return anchors;
}

export function topicalOverlap(query: string, text: string): number {
  if (CJK.test(query)) {
    const units = cjkUnits(query);
    if (units.length === 0) return 1;
    const haystack = text.toLowerCase();
    let matches = 0;
    for (const unit of units) {
      if (haystack.includes(unit)) matches += 1;
    }
    return matches / units.length;
  }
  const anchors = queryAnchors(query);
  if (anchors.length === 0) return 1;
  const haystack = new Set(tokenize(text).map(canonical));
  let matches = 0;
  for (const anchor of anchors) {
    if (matchesAnchor(anchor, haystack)) matches += 1;
  }
  return matches / anchors.length;
}

function cjkUnits(query: string): string[] {
  const compact = query
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, " ")
    .trim();
  const units = new Set<string>();
  for (const run of compact.split(/\s+/)) {
    if (!run) continue;
    if (/^[a-z0-9]+$/.test(run)) {
      if (run.length >= 2) units.add(run);
      continue;
    }
    const chars = Array.from(run);
    for (let index = 0; index < chars.length - 1; index += 1) {
      const current = chars[index];
      const next = chars[index + 1];
      if (current && next && /\p{Script=Han}/u.test(current) && /\p{Script=Han}/u.test(next)) {
        units.add(`${current}${next}`);
      }
    }
  }
  return Array.from(units);
}
