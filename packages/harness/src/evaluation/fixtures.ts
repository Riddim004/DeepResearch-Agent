import { FIXTURE_CORPUS, type FixtureDocument } from "../testing/fixtures";
import type {
  FetchedPage,
  PageFetcher,
  SearchOptions,
  SearchProvider,
  SearchResult,
} from "../types";
import { wordCount } from "../util/text";
import { normalizeUrl } from "../util/url";

export const CHINESE_CORPUS: FixtureDocument[] = [
  {
    url: "https://www.gov.cn/zhengce/2026-03/ai-agent-guidelines.htm",
    title: "生成式人工智能服务管理暂行办法实施情况通报",
    domain: "gov.cn",
    publishedAt: "2026-03-20",
    snippet:
      "备案与安全评估进展通报：累计一千一百余项服务完成备案，高风险场景要求人工复核与可追溯记录。",
    text: `国家网信办在2026年第一季度通报了生成式人工智能服务备案与安全评估的最新进展。截至三月末，累计完成备案的生成式人工智能服务达到一千一百余项，覆盖政务、金融、医疗与教育等二十多个行业。
通报要求，面向公众提供服务的模型必须完成安全评估，并对训练数据来源、标注规则和内容安全机制进行说明。对涉及个人信息的场景，运营者需要取得单独同意并保存访问日志不少于六个月。
在金融与医疗等高风险场景，监管部门强调人工复核不能缺位。通报指出，已有十七家机构因未按要求开展风险评估被要求限期整改，整改期间暂停新功能上线。
监管思路并不是限制技术应用，而是把可追溯、可审计和可纠正作为准入条件。对研究机构而言，这意味着评估报告、数据来源记录和版本变更日志将成为常态化的合规材料。`,
  },
  {
    url: "https://www.caixin.com/2026-04-12/agent-eval.html",
    title: "企业级 Agent 落地调查：成功率与失败原因",
    domain: "caixin.com",
    publishedAt: "2026-04-12",
    snippet:
      "对六十四家企业的半年跟踪显示，约三成智能体项目维持原有任务范围，工具调用错误是最主要的失败原因。",
    text: `财新对六十四家部署智能体的企业进行了为期半年的跟踪调查。调查显示，进入生产环境的智能体项目中，只有约三成在六个月后仍保持原有任务范围，其余项目被迫缩小范围或回退到人工流程。
失败原因中，工具调用错误占比最高，达到百分之三十八；其次是上下文超限和权限配置错误，分别占百分之二十四和百分之十九。真正由模型推理能力不足导致的失败只占百分之十一。
调查还发现，建立统一评估集的企业，项目存活率明显更高。没有评估集的企业中，只有百分之十九的项目通过内部风险评审；而维护评估集的企业，这一比例达到百分之五十二。
多位受访技术负责人表示，智能体的可靠性更多取决于工程约束，而不是模型参数规模。可回放的日志、明确的工具契约和人工兜底流程，被列为生产部署的三项基础能力。`,
  },
  {
    url: "https://www.36kr.com/p/agent-startups-2026",
    title: "Agent 创业公司转向垂直场景",
    domain: "36kr.com",
    publishedAt: "2026-05-08",
    snippet:
      "二十八家智能体初创公司中，十九家在最近两个季度调整了产品定位，垂直场景收入增长更快但交付成本更高。",
    text: `过去一年，国内智能体创业公司从通用助手转向法律、电商和制造等垂直场景。三十六氪统计的二十八家初创公司中，有十九家在最近两个季度调整了产品定位。
垂直场景的收入增长更快，但交付成本也更高。一家法律智能体公司透露，单个客户的实施周期从两周延长到六周，主要时间花在数据清洗和流程对接上。
投资人对赛道仍保持谨慎。多位投资人认为，通用智能体难以形成壁垒，而垂直场景需要同时具备行业数据和工程交付能力。
也有创业者提醒，垂直场景的评估标准更加严格。法律和医疗客户要求逐条引用依据，任何无法追溯的输出都会被拒绝。团队因此把引用核验和人工复核做成了标准流程。`,
  },
  {
    url: "https://zhuanlan.zhihu.com/p/agent-evaluation",
    title: "从业者讨论：智能体评估到底该怎么做",
    domain: "zhihu.com",
    publishedAt: "2026-06-02",
    snippet:
      "一线开发者讨论离线评分与线上失败的差距，建议把真实失败案例整理成回归用例并统计工具调用轨迹。",
    text: `在知乎的一个高赞讨论中，多位一线开发者分享了智能体评估的实践经验。讨论的核心问题是，离线评分很高的智能体，为什么上线后仍然频繁失败。
一位开发者认为，公开基准测试覆盖不了真实业务流程。他们团队把过去半年的线上失败案例整理成二百多条回归用例，每周跑一次，才逐渐稳住效果。
另一位参与者强调，评估不能只看最终答案，还要看工具调用轨迹。错误的搜索词、重复读取同一页面和遗漏关键来源，都应该被单独统计。
讨论中也有不同意见。有人认为小团队没有资源维护评估集，应该优先保证日志和人工复核；也有人反驳说，没有评估就无法判断改动是否有效，最终会陷入无止境的试错。
比较一致的建议是，从少量高价值场景开始，先建立可重复的测试流程，再逐步扩展到更多任务类型。`,
  },
];

export const EVAL_CORPORA = {
  english: FIXTURE_CORPUS,
  chinese: CHINESE_CORPUS,
} as const;

function hashQuery(query: string): number {
  let hash = 0;
  for (const char of query) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

export class CorpusSearchProvider implements SearchProvider {
  readonly id = "fixture";
  readonly label = "Evaluation corpus";

  constructor(
    private readonly documents: FixtureDocument[],
    private readonly options: { limit?: number; fail?: boolean } = {},
  ) {}

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    if (this.options.fail) throw new Error("Fixture search is offline.");
    const pool = this.options.limit ? this.documents.slice(0, this.options.limit) : this.documents;
    if (pool.length === 0) return [];
    const offset = hashQuery(query) % pool.length;
    const count = Math.min(options.maxResults, pool.length);
    return Array.from({ length: count }, (_, index) => {
      const document = pool[(index + offset) % pool.length];
      if (!document) throw new Error("Evaluation corpus is empty.");
      return {
        title: index === 0 ? `${query}: ${document.title}` : document.title,
        url: normalizeUrl(document.url) ?? document.url,
        snippet: document.snippet,
        provider: "fixture",
        rank: index + 1,
        publishedAt: document.publishedAt,
      };
    });
  }
}

export class CorpusFetcher implements PageFetcher {
  constructor(
    private readonly documents: FixtureDocument[],
    private readonly options: { fail?: boolean } = {},
  ) {}

  async fetch(url: string): Promise<FetchedPage> {
    if (this.options.fail) throw new Error("Fixture page fetch failed.");
    const target = normalizeUrl(url);
    const document = this.documents.find((item) => normalizeUrl(item.url) === target);
    if (!document) throw new Error(`No fixture document for ${url}`);
    return {
      url,
      finalUrl: url,
      title: document.title,
      text: document.text,
      excerpt: document.snippet,
      publishedAt: document.publishedAt,
      wordCount: wordCount(document.text),
    };
  }
}
