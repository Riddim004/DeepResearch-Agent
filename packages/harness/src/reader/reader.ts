import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";

import type { FetchedPage, PageFetcher } from "../types";
import { HarnessError } from "../util/errors";
import { cleanText, truncate, wordCount } from "../util/text";
import { assertSafeUrl } from "./safe-url";

const USER_AGENT =
  "Mozilla/5.0 (compatible; DossierBot/0.1; +https://github.com/Riddim004/DeepResearch-Agent)";

const MAX_REDIRECTS = 5;
const ALLOWED_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "application/pdf",
  "application/x-pdf",
  "application/octet-stream",
];

export interface PageReaderOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxTextChars?: number;
}

interface FetchPayload {
  buffer: Uint8Array;
  contentType: string;
  finalUrl: string;
}

export class PageReader implements PageFetcher {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxTextChars: number;

  constructor(options: PageReaderOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxBytes = options.maxBytes ?? 5_000_000;
    this.maxTextChars = options.maxTextChars ?? 40_000;
  }

  async fetch(url: string, options: { signal?: AbortSignal } = {}): Promise<FetchedPage> {
    const payload = await this.fetchPayload(url, options.signal);
    const contentType = payload.contentType.toLowerCase();
    const looksPdf =
      contentType.includes("pdf") ||
      payload.finalUrl.toLowerCase().endsWith(".pdf") ||
      startsWithPdf(payload.buffer);

    if (looksPdf) {
      return this.extractPdf(payload);
    }
    if (
      contentType.includes("text/html") ||
      contentType.includes("xhtml") ||
      contentType === "" ||
      (contentType.includes("octet-stream") && payload.buffer[0] === 0x3c)
    ) {
      return this.extractHtml(payload);
    }
    if (contentType.includes("text/plain")) {
      return this.extractPlainText(payload);
    }

    throw new HarnessError("INVALID_INPUT", `Unsupported source content type: ${contentType}`);
  }

  private async fetchPayload(url: string, signal?: AbortSignal): Promise<FetchPayload> {
    let current = url;
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const safeUrl = await assertSafeUrl(current);
      const response = await fetch(safeUrl, {
        redirect: "manual",
        signal: combined,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5",
          "accept-language": "en-US,en;q=0.9",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) {
          throw new HarnessError("INVALID_INPUT", "The source redirected without a location.");
        }
        current = new URL(location, safeUrl).toString();
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel();
        throw new HarnessError("INVALID_INPUT", `The source returned HTTP ${response.status}.`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType && !ALLOWED_TYPES.some((type) => contentType.toLowerCase().includes(type))) {
        await response.body?.cancel();
        throw new HarnessError("INVALID_INPUT", `Unsupported source content type: ${contentType}`);
      }

      const length = Number(response.headers.get("content-length") ?? "0");
      if (length > this.maxBytes) {
        await response.body?.cancel();
        throw new HarnessError("INVALID_INPUT", "The source is too large to read.");
      }

      if (!response.body) {
        throw new HarnessError("INVALID_INPUT", "The source returned an empty body.");
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > this.maxBytes) {
            throw new HarnessError("INVALID_INPUT", "The source is too large to read.");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      return {
        buffer: concatChunks(chunks, total),
        contentType,
        finalUrl: safeUrl.toString(),
      };
    }

    throw new HarnessError("INVALID_INPUT", "The source redirected too many times.");
  }

  private extractHtml(payload: FetchPayload): FetchedPage {
    const html = new TextDecoder("utf-8").decode(payload.buffer);
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", () => undefined);
    const dom = new JSDOM(html, { url: payload.finalUrl, virtualConsole });
    try {
      const document = dom.window.document;
      const meta = (selector: string): string =>
        document.querySelector<HTMLMetaElement>(selector)?.content?.trim() ?? "";

      const publishedAt =
        meta('meta[property="article:published_time"]') ||
        meta('meta[name="date"]') ||
        meta('meta[property="og:updated_time"]') ||
        meta('meta[name="publish-date"]') ||
        undefined;
      const siteName = meta('meta[property="og:site_name"]') || undefined;
      const language = document.documentElement.lang || undefined;

      const article = new Readability(document, {
        charThreshold: 160,
        keepClasses: false,
      }).parse();

      let text = cleanText(
        article?.content ? readableText(article.content, document) : (article?.textContent ?? ""),
      );
      if (text.length < 240) {
        for (const node of Array.from(
          document.querySelectorAll("script, style, nav, footer, aside, header, form, noscript"),
        )) {
          node.remove();
        }
        const fallback = document.querySelector("article, main, [role=main]") ?? document.body;
        text = cleanText(fallback?.textContent ?? "");
      }

      if (text.length < 120) {
        throw new HarnessError("INVALID_INPUT", "The page did not contain readable article text.");
      }

      text = stripLeadingAttribution(text, [article?.byline ?? "", siteName ?? ""].filter(Boolean));
      text = truncate(text, this.maxTextChars);
      const title =
        article?.title?.trim() ||
        meta('meta[property="og:title"]') ||
        document.title?.trim() ||
        new URL(payload.finalUrl).hostname;

      return {
        url: payload.finalUrl,
        finalUrl: payload.finalUrl,
        title: cleanText(title),
        text,
        excerpt: truncate(cleanText(article?.excerpt || text), 420),
        ...(article?.byline ? { byline: cleanText(article.byline) } : {}),
        ...(siteName ? { siteName: cleanText(siteName) } : {}),
        ...(language ? { language } : {}),
        ...(publishedAt ? { publishedAt } : {}),
        wordCount: wordCount(text),
      };
    } finally {
      dom.window.close();
    }
  }

  private extractPlainText(payload: FetchPayload): FetchedPage {
    const raw = cleanText(new TextDecoder("utf-8").decode(payload.buffer));
    if (raw.length < 60) {
      throw new HarnessError("INVALID_INPUT", "The source did not contain readable text.");
    }
    const text = truncate(raw, this.maxTextChars);
    return {
      url: payload.finalUrl,
      finalUrl: payload.finalUrl,
      title: decodeURIComponent(
        new URL(payload.finalUrl).pathname.split("/").pop() || "Text source",
      ),
      text,
      excerpt: truncate(text, 420),
      wordCount: wordCount(text),
    };
  }

  private async extractPdf(payload: FetchPayload): Promise<FetchedPage> {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(payload.buffer));
      const { text: pages } = await extractText(pdf, { mergePages: true });
      const text = truncate(
        cleanText(Array.isArray(pages) ? pages.join("\n\n") : pages),
        this.maxTextChars,
      );
      if (text.length < 120) {
        throw new HarnessError("INVALID_INPUT", "The PDF did not contain extractable text.");
      }
      const pathName = decodeURIComponent(
        new URL(payload.finalUrl).pathname.split("/").pop() ?? "",
      );
      return {
        url: payload.finalUrl,
        finalUrl: payload.finalUrl,
        title: pathName.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ") || "PDF source",
        text,
        excerpt: truncate(text, 420),
        wordCount: wordCount(text),
      };
    } catch (error) {
      if (error instanceof HarnessError) throw error;
      throw new HarnessError("INVALID_INPUT", "The PDF could not be parsed.", { cause: error });
    }
  }
}

function startsWithPdf(buffer: Uint8Array): boolean {
  return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
}

const LEADING_DATE =
  /^\s*(?:updated\s+)?\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\s*/i;
const IMAGE_CREDIT = /\b(?:getty images|afp|ap photo|alamy|pa media|pa wire|shutterstock)\b/gi;

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TD",
  "TH",
  "TR",
  "UL",
]);

const STRIP_TAGS = "script, style, noscript, form, button, svg, figure, figcaption, picture";
const STRIP_CLASSES = [
  "[class*='Credit']",
  "[class*='credit']",
  "[class*='Caption']",
  "[class*='caption']",
  "[class*='Byline']",
  "[class*='byline']",
];

function readableText(html: string, document: Document): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  for (const selector of [STRIP_TAGS, ...STRIP_CLASSES]) {
    for (const node of Array.from(container.querySelectorAll(selector))) {
      if (node === container) continue;
      node.remove();
    }
  }

  let output = "";
  const appendBreak = () => {
    if (output && !output.endsWith("\n")) output += "\n";
  };
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      output += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    const tag = element.tagName;
    if (tag === "BR") {
      output += "\n";
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block) appendBreak();
    for (const child of Array.from(element.childNodes)) walk(child);
    if (block) output += "\n";
  };

  walk(container);
  return output;
}

function stripLeadingAttribution(text: string, names: string[]): string {
  const paragraphs = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  let removed = 0;
  while (paragraphs.length > 1 && removed < 4 && isMetaLine(paragraphs[0] ?? "", names)) {
    paragraphs.shift();
    removed += 1;
  }
  if (paragraphs.length === 0) return cleanText(text);

  const first = (paragraphs[0] ?? "")
    .replace(IMAGE_CREDIT, " ")
    .replace(LEADING_DATE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  paragraphs[0] = first;
  return cleanText(paragraphs.join("\n\n"));
}

function isMetaLine(line: string, names: string[]): boolean {
  if (!line || line.length > 160) return false;
  if (names.some((name) => name.length > 2 && line.toLowerCase() === name.toLowerCase())) {
    return true;
  }
  if (/^by\s+[A-Z]/.test(line)) return true;
  if (
    /^\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/i.test(line)
  ) {
    return true;
  }
  if (
    /\b(?:reporter|correspondent|editor|journalist|contributor|producer|presenter|anchor)\b/i.test(
      line,
    ) &&
    !/[.!?]$/.test(line)
  ) {
    return true;
  }
  if (/^(?:image|photo|credit|source)\b/i.test(line)) return true;
  return false;
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
