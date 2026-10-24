"use client";

import {
  appendSourceLedger,
  citationStats,
  linkifyCitations,
  slugify,
  wordCount,
  type Source,
} from "@dossier/harness/browser";
import { Check, Copy, Download, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { formatDate, formatNumber } from "@/lib/utils";
import { useThrottledValue } from "./use-run";

function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: React.ReactNode } }).props;
    return textOf(props?.children);
  }
  return "";
}

function headingsOf(markdown: string): Array<{ text: string; id: string }> {
  const headings: Array<{ text: string; id: string }> = [];
  for (const match of markdown.matchAll(/^##\s+(.+)$/gm)) {
    const text = (match[1] ?? "").replace(/[*_`]/g, "").trim();
    if (text) headings.push({ text, id: slugify(text) });
  }
  return headings;
}

export function ReportView({
  markdown,
  title,
  sources,
  streaming,
  createdAt,
  onCitation,
}: {
  markdown: string;
  title: string;
  sources: Source[];
  streaming: boolean;
  createdAt: number;
  onCitation: (number: number) => void;
}) {
  const throttled = useThrottledValue(markdown, streaming ? 90 : 0);
  const [copied, setCopied] = useState(false);

  const validNumbers = useMemo(
    () => new Set(sources.map((source) => source.number).filter((n): n is number => n !== null)),
    [sources],
  );
  const linked = useMemo(
    () => linkifyCitations(throttled, validNumbers),
    [throttled, validNumbers],
  );
  const stats = useMemo(() => citationStats(throttled), [throttled]);
  const words = useMemo(() => wordCount(throttled), [throttled]);
  const headings = useMemo(() => headingsOf(throttled), [throttled]);
  const fullDocument = useMemo(() => appendSourceLedger(markdown, sources), [markdown, sources]);

  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        if (href?.startsWith("cite:")) {
          const number = Number(href.slice(5));
          return (
            <sup>
              <button
                type="button"
                className="citation-pill"
                onClick={() => onCitation(number)}
                title={`Open source ${number}`}
                aria-label={`Open source ${number}`}
              >
                {children}
              </button>
            </sup>
          );
        }
        return (
          <a href={href} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        );
      },
      h1({ children }) {
        return <h1 id="report-title">{children}</h1>;
      },
      h2({ children }) {
        const id = slugify(textOf(children));
        return (
          <h2 id={id} className="scroll-mt-32">
            {children}
          </h2>
        );
      },
      h3({ children }) {
        const id = slugify(textOf(children));
        return (
          <h3 id={id} className="scroll-mt-32">
            {children}
          </h3>
        );
      },
      table({ children }) {
        return (
          <div className="my-5 overflow-x-auto">
            <table>{children}</table>
          </div>
        );
      },
      img({ alt }) {
        return (
          <span className="my-2 inline-flex rounded border border-line bg-paper-3 px-2 py-1 font-mono text-[0.625rem] text-muted">
            [image{alt ? `: ${alt}` : ""}]
          </span>
        );
      },
    }),
    [onCitation],
  );

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(fullDocument);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be unavailable in insecure contexts.
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([fullDocument], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dossier-${slugify(title || "report") || "report"}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <article id="report" className="print-report max-w-[48rem]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-3">
          <span className="label label-strong">Research brief</span>
          <span className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-faint">
            {formatDate(createdAt)} · {formatNumber(words)} words · {stats.citationCount} citations
          </span>
        </div>
        <div className="no-print flex items-center gap-1">
          <button
            type="button"
            onClick={() => void copyMarkdown()}
            className="btn btn-sm btn-quiet gap-1.5"
            aria-label="Copy markdown"
          >
            {copied ? (
              <Check className="size-3.5 text-moss" strokeWidth={2} />
            ) : (
              <Copy className="size-3.5" strokeWidth={1.7} />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={downloadMarkdown}
            className="btn btn-sm btn-quiet gap-1.5"
            aria-label="Download markdown"
          >
            <Download className="size-3.5" strokeWidth={1.7} />
            <span className="hidden sm:inline">Markdown</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-sm btn-quiet !px-2"
            aria-label="Print report"
            title="Print"
          >
            <Printer className="size-3.5" strokeWidth={1.7} />
          </button>
        </div>
      </div>

      {headings.length > 1 && (
        <nav
          aria-label="Report contents"
          className="no-print mb-8 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line pb-4"
        >
          <span className="label mr-1">In this brief</span>
          {headings.slice(0, 7).map((heading) => (
            <a
              key={heading.id}
              href={`#${heading.id}`}
              className="text-[0.6875rem] text-muted transition-colors hover:text-ink"
            >
              {heading.text}
            </a>
          ))}
        </nav>
      )}

      <div className="prose-dossier">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={components}
          urlTransform={(url) => {
            if (url.startsWith("cite:")) return url;
            if (/^(https?:\/\/|mailto:|#|\/)/i.test(url)) return url;
            return "";
          }}
        >
          {linked}
        </Markdown>
        {streaming && (
          <div className="mt-5 flex items-center gap-2 font-sans text-[0.625rem] uppercase tracking-[0.12em] text-muted">
            <span className="stream-caret" aria-hidden />
            Drafting
          </div>
        )}
      </div>

      {!streaming && (
        <div className="mt-10 border-t border-line pt-4 font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-faint">
          End of brief · {stats.citedSentences}/{stats.sentences} sentences cited
        </div>
      )}
    </article>
  );
}
