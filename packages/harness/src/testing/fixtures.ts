import type {
  FetchedPage,
  PageFetcher,
  SearchOptions,
  SearchProvider,
  SearchResult,
} from "../types";
import { normalizeUrl } from "../util/url";

export interface FixtureDocument {
  url: string;
  title: string;
  domain: string;
  publishedAt: string;
  snippet: string;
  text: string;
}

export const FIXTURE_CORPUS: FixtureDocument[] = [
  {
    url: "https://arxiv.org/abs/2601.00001",
    title: "Agent harnesses: the missing layer between models and production",
    domain: "arxiv.org",
    publishedAt: "2026-01-14",
    snippet:
      "A systems paper argues that reliable agents depend less on model choice than on the harness around the model: tool contracts, context budgets, retries, and observability.",
    text: `Agent harnesses have become the decisive engineering layer for production AI systems. A model is a component; the harness is what turns that component into a dependable worker. The paper defines a harness as the runtime that owns the agent loop, tool schemas, context assembly, cancellation, retries, and trace capture.

Across twelve deployed systems, teams reported that most failures were not reasoning failures. They were interface failures: malformed tool arguments, unbounded context growth, missing timeouts, and the inability to replay a run after a failure. Teams that added typed tool contracts and per-run budgets reduced incident rates by roughly half.

The authors caution that harness quality is hard to benchmark. Public model evaluations usually hold the harness constant, which hides the operational work that determines whether an agent succeeds in production. They recommend publishing traces and tool contracts alongside benchmark numbers.`,
  },
  {
    url: "https://www.technologyreview.com/2026/02/03/agent-harness-teams",
    title: "Why AI teams are hiring harness engineers",
    domain: "technologyreview.com",
    publishedAt: "2026-02-03",
    snippet:
      "Job listings and interviews point to a new role: engineers who design the loop, evaluation, and guardrails around foundation models rather than train the models themselves.",
    text: `A growing number of AI teams are reorganizing around the agent harness rather than the model. Interviews with engineering leads at eight companies found that the role combines distributed systems, developer tooling, and evaluation design.

The work is unglamorous but consequential. Harness engineers own the event protocol that streams progress to users, the retry policy that keeps a run alive when a provider rate-limits, and the citation layer that makes outputs auditable. One lead described the harness as "the product surface that the model never sees."

The article also notes a tension: harnesses accumulate custom logic quickly, and teams that do not version prompts and tool contracts end up unable to explain regressions. The most mature teams treat the harness as an observable system with typed events and replayable traces.`,
  },
  {
    url: "https://www.oecd.org/publications/ai-agents-2026",
    title: "AI agents in the enterprise: adoption, risk and governance",
    domain: "oecd.org",
    publishedAt: "2026-03-18",
    snippet:
      "Survey data from 1,900 firms finds adoption concentrated in support and research workflows, with auditability cited as the main blocker to expansion.",
    text: `Enterprise adoption of AI agents remains uneven. In a survey of 1,900 firms, 38 percent reported at least one agent in production, but most deployments were narrow: customer support triage, internal research, and software maintenance.

Auditability was the most frequently cited blocker to expansion. Only 21 percent of respondents said they could reconstruct why an agent produced a specific output. Firms that maintained source-level citations and tool traces were three times more likely to report that an agent had passed an internal risk review.

The report recommends treating agent runs as records: store the inputs, tool calls, retrieved evidence, model version, and final output together. It also warns that vendor claims about reliability are difficult to compare without a shared evaluation protocol.`,
  },
  {
    url: "https://www.nature.com/articles/s41586-026-00001-2",
    title: "Benchmarking research agents against expert literature reviews",
    domain: "nature.com",
    publishedAt: "2026-04-09",
    snippet:
      "A blinded study finds research agents can retrieve relevant papers but often overstate certainty and omit contradictory findings.",
    text: `Research agents are useful retrieval tools but unreliable analysts, according to a blinded study comparing agent-written literature reviews with expert reviews. Agents found relevant papers at a high rate, but their summaries frequently omitted contradictory findings and overstated the strength of evidence.

The study evaluated 180 questions across biomedicine and environmental science. Expert reviewers rated 61 percent of agent summaries as factually accurate but only 29 percent as appropriately calibrated. The most common failure was presenting a single study as settled consensus.

The authors argue that research agents need explicit uncertainty reporting and citation-level verification. They recommend requiring agents to list disconfirming evidence and to distinguish between correlation, mechanism, and causal claims.`,
  },
  {
    url: "https://github.com/example/openharness",
    title: "OpenHarness: an open-source runtime for tool-using agents",
    domain: "github.com",
    publishedAt: "2026-05-22",
    snippet:
      "An open-source project packages the agent loop, typed tool registry, event streaming, and replay into a reusable harness with a small core and adapters.",
    text: `OpenHarness is an open-source runtime for tool-using agents. Its core is deliberately small: a loop, a typed tool registry, an event bus, and a replayable run store. Providers, search APIs, and storage backends are adapters.

The project's maintainers argue that most agent frameworks hide too much. OpenHarness exposes the event stream so that applications can render progress, audit tool calls, and resume after failures. Every run is a sequence of typed events rather than an opaque message log.

Early adopters report that the hardest part is not the loop but the context assembly. The project includes a budgeting layer that selects evidence by relevance and caps per-source excerpts, preventing one long document from crowding out the rest of the evidence base.`,
  },
  {
    url: "https://www.ft.com/content/agent-harness-costs",
    title: "The hidden cost of agentic research",
    domain: "ft.com",
    publishedAt: "2026-06-11",
    snippet:
      "Companies are discovering that multi-step research agents can consume far more tokens than expected, pushing teams toward budgets and smaller models.",
    text: `Agentic research is more expensive than many teams expect. Multi-step agents repeatedly search, read, and rewrite, and each step can resend a large evidence context to the model. Finance teams at several companies said agent pilots had exceeded initial token budgets by a factor of three to five.

The response has been a mix of engineering and product discipline. Teams cap the number of sources read, summarize evidence before synthesis, and route low-stakes steps to cheaper models. Some now show a live cost estimate while an agent is running.

Cost control is not only a finance problem. Unbounded agents also produce worse outputs because noisy context dilutes the evidence. The article quotes one engineer: "The budget is a quality feature, not just a cost feature."`,
  },
  {
    url: "https://www.bbc.com/news/technology-ai-agent-audits",
    title: "Regulators begin asking for AI agent audit trails",
    domain: "bbc.com",
    publishedAt: "2026-07-02",
    snippet:
      "New guidance in the UK and EU asks firms to retain records of agent inputs, tools, and evidence for high-impact decisions.",
    text: `Regulators are beginning to treat AI agent runs as records that must be retained and explained. Draft guidance in the UK and EU asks firms deploying agents in high-impact decisions to keep records of inputs, tool calls, retrieved evidence, and model versions.

The guidance does not mandate a specific technology, but it effectively favors systems that can replay a run. Firms using opaque chat logs are likely to struggle to reconstruct which evidence supported a decision.

Industry groups have asked for clearer standards and safe harbors for open-source tooling. Consumer advocates argue that auditability should be a baseline requirement, not a competitive differentiator.`,
  },
  {
    url: "https://hai.stanford.edu/ai-index-2026",
    title: "AI Index 2026: agents move from demos to operations",
    domain: "hai.stanford.edu",
    publishedAt: "2026-08-15",
    snippet:
      "The annual index finds a shift from model-centric demos to operational agent systems, with evaluation and governance lagging behind deployment.",
    text: `The 2026 AI Index documents a shift from model-centric demonstrations to operational agent systems. Enterprise deployments are growing, but evaluation and governance practices are lagging.

The report finds that most agent evaluations still focus on single-turn task success rather than multi-step reliability. It recommends measuring recovery from tool failures, citation accuracy, and the cost of a completed task.

Researchers also note a gap between demos and production. Demos optimize for the happy path; production systems must handle timeouts, partial failures, stale data, and adversarial inputs. The report calls for shared benchmarks that include these conditions.`,
  },
];

function hashUrl(url: string): number {
  let hash = 0;
  for (const char of url) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

export class FixtureSearchProvider implements SearchProvider {
  readonly id = "fixture";
  readonly label = "Fixture search";

  constructor(private readonly delayMs = 0) {}

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const offset = hashUrl(query) % FIXTURE_CORPUS.length;
    return FIXTURE_CORPUS.slice(0, options.maxResults).map((item, index) => {
      const document =
        FIXTURE_CORPUS[(index + offset) % FIXTURE_CORPUS.length] ?? FIXTURE_CORPUS[0];
      if (!document) throw new Error("Fixture corpus is empty");
      return {
        title: index === 0 ? `${query}: ${document.title}` : document.title,
        url: normalizeUrl(document.url) ?? document.url,
        snippet: document.snippet,
        provider: "fixture",
        rank: index + 1,
        ...(document.publishedAt ? { publishedAt: document.publishedAt } : {}),
      };
    });
  }
}

export class FixturePageFetcher implements PageFetcher {
  async fetch(url: string): Promise<FetchedPage> {
    const document =
      FIXTURE_CORPUS.find((item) => normalizeUrl(item.url) === normalizeUrl(url)) ??
      FIXTURE_CORPUS[0];
    if (!document) throw new Error("Fixture document not found");
    return {
      url,
      finalUrl: url,
      title: document.title,
      text: document.text,
      excerpt: document.snippet,
      publishedAt: document.publishedAt,
      wordCount: document.text.split(/\s+/).length,
    };
  }
}

export const FIXTURE_QUERY = "How are open-source AI agent harnesses changing software teams?";
