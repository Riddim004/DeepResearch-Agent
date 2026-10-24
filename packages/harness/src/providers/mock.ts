import type {
  CompletionRequest,
  Depth,
  ModelProvider,
  ModelStreamEvent,
  ResearchBrief,
  Usage,
} from "../types";
import { citationStats } from "../citations";
import { sleep } from "../util/async";
import { estimateTokens, keywordScore, splitSentences, truncate } from "../util/text";

interface MockSource {
  number: number;
  title: string;
  domain: string;
  url: string;
  excerpt: string;
}

interface MockMetadata {
  query?: string;
  depth?: Depth;
  language?: string;
  maxQueries?: number;
  brief?: ResearchBrief;
  sources?: MockSource[];
  report?: string;
  round?: number;
}

const CJK = /[\u3000-\u9fff]/;

export interface MockProviderOptions {
  delayMs?: number;
  model?: string;
}

export class MockProvider implements ModelProvider {
  readonly id = "demo";
  readonly model: string;
  readonly demo = true;
  private readonly delayMs: number;

  constructor(options: MockProviderOptions = {}) {
    this.model = options.model ?? "dossier-demo-writer";
    this.delayMs = options.delayMs ?? 12;
  }

  async *stream(request: CompletionRequest): AsyncIterable<ModelStreamEvent> {
    const metadata = (request.metadata ?? {}) as MockMetadata;
    const output = this.build(request, metadata);
    const isReport = request.task === "report" || request.task === "revise";

    if (isReport && this.delayMs > 0) {
      for (const chunk of chunkText(output, 52)) {
        yield { type: "text", text: chunk };
        await sleep(this.delayMs, request.signal);
      }
    } else {
      yield { type: "text", text: output };
    }

    const inputTokens = request.messages.reduce(
      (total, message) => total + estimateTokens(message.content),
      0,
    );
    const outputTokens = estimateTokens(output);
    const usage: Usage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
    yield { type: "usage", usage };
    yield { type: "done", finishReason: "stop" };
  }

  private build(request: CompletionRequest, metadata: MockMetadata): string {
    const query = metadata.query ?? extractQuery(request.messages);
    const chinese = CJK.test(query) || metadata.language?.startsWith("zh");

    if (request.task === "plan") {
      return JSON.stringify(this.plan(query, metadata, Boolean(chinese)));
    }
    if (request.task === "followup") {
      return JSON.stringify(this.followup(query, metadata, Boolean(chinese)));
    }
    if (request.task === "audit") {
      return JSON.stringify(this.audit(metadata, Boolean(chinese)));
    }
    return this.report(metadata, Boolean(chinese));
  }

  private plan(query: string, metadata: MockMetadata, chinese: boolean): ResearchBrief {
    const maxQueries = Math.max(3, Math.min(metadata.maxQueries ?? 5, 8));
    const base = truncate(query.replace(/[?？.。]+$/, ""), 90);
    const queries = [
      { query: base, kind: "primary" as const, rationale: "Direct evidence on the question" },
      {
        query: `${base} evidence data study`,
        kind: "evidence" as const,
        rationale: "Primary evidence and measurable findings",
      },
      {
        query: `${base} criticism limitations`,
        kind: "counterpoint" as const,
        rationale: "Credible disagreement and failure modes",
      },
      {
        query: `${base} analysis`,
        kind: "primary" as const,
        rationale: "Expert analysis and synthesis",
      },
      {
        query: `${base} ${new Date().getUTCFullYear()}`,
        kind: "recent" as const,
        rationale: "The most recent developments",
      },
      {
        query: `${base} case study`,
        kind: "evidence" as const,
        rationale: "Concrete examples and implementation detail",
      },
      {
        query: `${base} independent evaluation`,
        kind: "counterpoint" as const,
        rationale: "Independent assessment",
      },
      {
        query: `${base} policy regulation`,
        kind: "recent" as const,
        rationale: "Governance and constraints",
      },
    ].slice(0, maxQueries);

    if (chinese) {
      return {
        title: truncate(base, 70),
        restated: `本简报围绕“${truncate(query, 120)}”这一问题，梳理可核查的证据、分歧与未知。`,
        audience: "希望快速获得可靠依据的决策者与研究者",
        subquestions: [
          { question: "现有证据能够确认什么？", why: "建立事实基础" },
          { question: "证据在哪里最强、哪里最薄弱？", why: "区分观点与证据" },
          { question: "哪些反面证据或限制会改变判断？", why: "避免单边结论" },
          { question: "什么新证据会推翻当前结论？", why: "界定结论边界" },
        ],
        queries,
        successCriteria: [
          "每个事实性判断都有可追溯的来源",
          "同时呈现支持与反对的证据",
          "明确指出证据缺口",
        ],
      };
    }

    return {
      title: truncate(base, 80),
      restated: `This brief examines ${truncate(query, 140)} by weighing the available evidence, its disagreements, and its blind spots.`,
      audience: "An informed generalist making a decision",
      subquestions: [
        {
          question: "What can be established from the available evidence?",
          why: "Establish what can be confirmed",
        },
        {
          question: "Where is the evidence strongest, and where is it thin?",
          why: "Separate claims from evidence",
        },
        {
          question: "What counterevidence or constraints complicate the picture?",
          why: "Stress-test the conclusion",
        },
        { question: "What would change the conclusion?", why: "Define the limits of the answer" },
      ],
      queries,
      successCriteria: [
        "Every factual claim is traceable to a source",
        "Supporting and opposing evidence are presented together",
        "Evidence gaps are stated explicitly",
      ],
    };
  }

  private followup(
    query: string,
    metadata: MockMetadata,
    chinese: boolean,
  ): { gaps: string[]; queries: Array<{ query: string; rationale: string }> } {
    if ((metadata.round ?? 1) >= 2) return { gaps: [], queries: [] };
    const base = truncate(query.replace(/[?？.。]+$/, ""), 80);
    return {
      gaps: chinese
        ? ["缺少独立评估与具体案例", "最新数据可能改变判断"]
        : ["Independent evaluation is thin", "The most recent data may change the picture"],
      queries: chinese
        ? [
            { query: `${base} 独立评估 案例`, rationale: "补充独立评估" },
            { query: `${base} 最新数据`, rationale: "补充近期数据" },
          ]
        : [
            {
              query: `${base} independent evaluation case study`,
              rationale: "Add independent evaluation",
            },
            { query: `${base} latest data`, rationale: "Capture recent data" },
          ],
    };
  }

  private report(metadata: MockMetadata, chinese: boolean): string {
    const allSources = metadata.sources ?? [];
    const sources = allSources.filter((source) => source.excerpt.trim().length > 0);
    const brief = metadata.brief;
    const title = brief?.title ?? truncate(metadata.query ?? "Research brief", 80);
    const restated = brief?.restated ?? metadata.query ?? "";
    let n = sources.length;

    if (n === 0) {
      return `# ${title}

> No readable evidence was available, so this brief makes no factual claims.

## Bottom line

The run could not retrieve usable sources. Treat the question as unresolved.
`;
    }

    let available = [...sources];
    const used = new Map<number, Set<string>>();
    const citations = (source: MockSource): string => `[${source.number}]`;

    const pick = (focus: string): MockSource => {
      if (available.length === 0) available = [...sources];
      const ranked = [...available].sort(
        (a, b) =>
          keywordScore(focus, `${b.title} ${b.excerpt}`) -
          keywordScore(focus, `${a.title} ${a.excerpt}`),
      );
      const chosen = ranked[0] ?? sources[0];
      if (!chosen) throw new Error("Mock report has no sources");
      available = available.filter((source) => source.number !== chosen.number);
      return chosen;
    };

    const sentencesOf = (source: MockSource): string[] => {
      const noise =
        /(tl;?dr|subscribe|newsletter|cookie|sign up|read more|click here|follow us|share this|advertisement|sponsored|all rights reserved|privacy policy|terms of service|skip to content|enable javascript|browse the searchable|this week:|authors?:|arxiv:|view pdf|abstract:|wikimedia commons|coordinates?:|for data storage|this article is about|main article|see also|further information|external links|bibliography|retrieved|archived from|isbn|doi:|oclc|globe ?newswire|researchandmarkets|business wire|pr newswire|has been added to|press release|getty images|image source|image caption|photograph:|photo:|第一作者|通讯作者|责任编辑|原标题|图片来源|扫码|点击|订阅|转载|版权所有|免责声明)/i;
      const filler =
        /(is an arrangement where|is the part of|is a concept|refers to|is defined as|can be a part of|are the complementary parts|has varying definitions|game.?changer|perfect ammunition|zero negative impact|is a japanese vocabulary word|just proved|here'?s the proof)/i;
      const dangling =
        /^\s*(therefore|instead|as a result|that said|consequently|likewise|at first glance|of course|and yet|still),/i;
      const emoji = /[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}]/u;
      const leadingMeta = /^\s*(?:\d{1,2}\s+[A-Z][a-z]+\s+\d{4}\b|by\s+[A-Z])/;
      const cleaned = source.excerpt
        .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/(\d{4})(?=[A-Z][a-z])/g, "$1 ");
      return cleaned
        .split(/\n+/)
        .flatMap((line) => splitSentences(line.replace(/\s+/g, " ").trim()))
        .map((sentence) =>
          sentence
            .replace(/^\s*\d+[.)]\s*/, "")
            .replace(
              /^(?:key takeaways|what we found|the bottom line|editor'?s note)\s*[:—-]\s*/i,
              "",
            )
            .trim(),
        )
        .filter(
          (sentence) =>
            sentence.length > (CJK.test(sentence) ? 24 : 55) &&
            sentence.length < 480 &&
            !sentence.endsWith("?") &&
            !sentence.endsWith("？") &&
            !sentence.endsWith("…") &&
            !noise.test(sentence) &&
            !filler.test(sentence) &&
            !dangling.test(sentence) &&
            !leadingMeta.test(sentence) &&
            !emoji.test(sentence),
        );
    };

    const evidenceWords =
      /\b(\d[\d,.]*(?:%| percent| million| billion| hours?| days?)?|study|studies|trial|survey|research|found|reported|according to|data|analysis|increase[ds]?|decrease[ds]?|improved?|reduced?|productivity|well-being|retention|revenue|output|stress|burnout)\b/i;
    const analysisWords =
      /\b(however|although|despite|whereas|but|critics?|concerns?|risk|limitation|challenge|skeptic)/i;
    const sentenceWeight = (focus: string, sentence: string): number => {
      let score = keywordScore(focus, sentence) * 1.4;
      if (evidenceWords.test(sentence)) score += 0.45;
      if (analysisWords.test(sentence)) score += 0.12;
      if (sentence.length > 320) score -= 0.1;
      return score;
    };

    const usableSources = sources.filter((source) => sentencesOf(source).length > 0);
    if (usableSources.length > 0) {
      available = [...usableSources];
    }

    const evidence = (source: MockSource, focus: string, count = 1): string => {
      const list = sentencesOf(source);
      let usedForSource = used.get(source.number);
      if (!usedForSource) {
        usedForSource = new Set<string>();
        used.set(source.number, usedForSource);
      }
      let pool = list.filter((sentence) => !usedForSource.has(sentence));
      if (pool.length === 0) {
        usedForSource.clear();
        pool = list;
      }
      const selected = [...pool]
        .sort((a, b) => sentenceWeight(focus, b) - sentenceWeight(focus, a))
        .slice(0, Math.min(count, pool.length));
      for (const sentence of selected) usedForSource.add(sentence);
      const asSentence = (value: string): string =>
        /[.!?。！？]["'”’)\]]?$/.test(value) ? value : `${value}.`;
      const text =
        selected.length > 0
          ? selected.map(asSentence).join(" ")
          : truncate(source.excerpt.replace(/\s+/g, " "), 300);
      return `${text} ${citations(source)}`;
    };

    const depth = metadata.depth ?? "standard";
    const maxFindings = depth === "quick" ? 2 : depth === "deep" ? 4 : 3;
    const bulletCount = depth === "quick" ? 2 : 3;
    const perFinding = depth === "deep" ? 3 : 2;

    const summarySource = pick(restated);
    const bulletSources = Array.from({ length: bulletCount }, () => pick(restated));
    const bullets = bulletSources.map((source) => `- ${evidence(source, restated)}`).join("\n");

    const findings = (brief?.subquestions ?? [])
      .slice(0, maxFindings)
      .map((subquestion) => {
        const first = pick(subquestion.question);
        const second = pick(subquestion.question);
        const third = perFinding > 2 ? pick(subquestion.question) : null;
        return `### ${subquestion.question}

${evidence(first, subquestion.question)} ${evidence(second, subquestion.question)}${third ? ` ${evidence(third, subquestion.question, 1)}` : ""}`;
      })
      .join("\n\n");

    const counterFocus = "criticism limitation risk disagreement counterevidence";
    const limitFocus = "uncertainty gap missing data limitation";
    const counterScan = `${restated} ${counterFocus}`;
    const limitScan = `${restated} ${limitFocus}`;
    const counterOne = pick(counterScan);
    const counterTwo = pick(counterScan);
    const limit = pick(limitScan);
    const bottomOne = pick(restated);
    const bottomTwo = pick(restated);

    if (chinese) {
      return `# ${title}

> ${restated.replace(/[。.]$/, "")}——现有证据支持一个有条件、而非绝对的结论 ${citations(summarySource)}。

## 执行摘要

本简报基于 ${n} 个已读来源，正文按编号标注证据，并保留分歧与不确定性 ${citations(summarySource)}。

${bullets}

## 主要发现

${findings}

## 反证与分歧

${evidence(counterOne, counterScan)} ${evidence(counterTwo, counterScan)} 这种分歧并非措辞差异，它直接影响结论应有的置信度 ${citations(counterOne)}。

## 局限与未解问题

现有证据只有 ${n} 个来源，其中包含二手材料，不能代表全部专家意见 ${citations(summarySource)}。${evidence(limit, limitScan)} 最重要的问题是这些发现能否在更新的原始数据中复现 ${citations(limit)}。

## 结论

总体上，${evidence(bottomOne, restated)} 更稳妥的结论是：${evidence(bottomTwo, restated)} 在更强证据出现前，应把它视为可修正的工作假设 ${citations(bottomTwo)}。
`;
    }

    return `# ${title}

> ${restated.replace(/[。.]$/, "")} — the available evidence supports a conditional answer, not a slogan ${citations(summarySource)}.

## Executive summary

This brief draws on ${n} sources read end to end, with every claim cited inline and disagreements left visible ${citations(summarySource)}.

${bullets}

## Key findings

${findings}

## Counterevidence and disagreement

${evidence(counterOne, counterScan)} ${evidence(counterTwo, counterScan)} That disagreement is not cosmetic: it changes how much confidence the answer deserves ${citations(counterOne)}.

## Limitations and open questions

The evidence base contains ${n} sources, several of them secondary accounts, so it is not a census of expert opinion ${citations(summarySource)}. ${evidence(limit, limitScan)} The most important unresolved question is whether these findings replicate in newer primary data ${citations(limit)}.

## Bottom line

On balance: ${evidence(bottomOne, restated)} ${evidence(bottomTwo, restated)} The condition matters — until stronger independent evidence arrives, treat this as a working hypothesis that can be revised ${citations(bottomTwo)}.
`;
  }

  private audit(
    metadata: MockMetadata,
    chinese: boolean,
  ): {
    score: number;
    issues: Array<{ severity: string; claim: string; problem: string; suggestion: string }>;
    missingAngles: string[];
    verdict: "pass" | "revise";
    notes: string;
  } {
    const report = metadata.report ?? "";
    const sources = metadata.sources ?? [];
    const stats = citationStats(report);
    const coverage = stats.coverage;
    const issues: Array<{ severity: string; claim: string; problem: string; suggestion: string }> =
      [];

    if (coverage < 0.5) {
      issues.push({
        severity: "medium",
        claim: chinese ? "部分事实性句子没有引用" : "Some factual sentences carry no citation",
        problem: chinese ? "结论无法逐句追溯" : "The audit cannot trace every sentence to evidence",
        suggestion: chinese
          ? "为每个事实性判断补充来源编号"
          : "Attach a source number to each factual claim",
      });
    }
    if (sources.length < 3) {
      issues.push({
        severity: "medium",
        claim: chinese ? "来源数量偏少" : "The source base is thin",
        problem: chinese ? "独立来源不足" : "Too few independent sources",
        suggestion: chinese ? "增加不同出版方的材料" : "Add sources from other publishers",
      });
    }

    const score = Math.min(96, Math.round(52 + coverage * 42 + Math.min(sources.length, 6)));
    const verdict = coverage >= 0.45 && sources.length >= 3 ? "pass" : "revise";
    return {
      score,
      issues,
      missingAngles: [],
      verdict,
      notes: chinese
        ? `演示审计：${Math.round(coverage * 100)}% 的句子带有引用，覆盖 ${sources.length} 个来源。`
        : `Demo audit: ${Math.round(coverage * 100)}% citation coverage across ${sources.length} sources.`,
    };
  }
}

function extractQuery(messages: CompletionRequest["messages"]): string {
  for (const message of messages) {
    const tagged = /<request>([\s\S]*?)<\/request>/.exec(message.content);
    if (tagged?.[1]) return tagged[1].trim();
    const topic = /Research (?:query|topic):\s*(.+)/i.exec(message.content);
    if (topic?.[1]) return topic[1].trim();
  }
  return "the research question";
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  const words = text.match(/\S+\s*/g) ?? [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length > size && current) {
      chunks.push(current);
      current = "";
    }
    current += word;
  }
  if (current) chunks.push(current);
  return chunks;
}
