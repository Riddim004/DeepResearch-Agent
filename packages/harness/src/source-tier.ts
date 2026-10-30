export type SourceTier = "S" | "A" | "B" | "C";

// S: official or primary records. A: peer-reviewed, standards, authoritative press.
// B: established general media and industry outlets. C: unrated, UGC or social.
export const SOURCE_TIER_WEIGHTS: Record<SourceTier, number> = {
  S: 1,
  A: 0.8,
  B: 0.55,
  C: 0.25,
};

export const SOURCE_TIER_LABELS: Record<SourceTier, string> = {
  S: "Official or primary",
  A: "Peer-reviewed or authoritative",
  B: "Established media",
  C: "Unrated or user-generated",
};

const OFFICIAL = new Set([
  "europa.eu",
  "un.org",
  "worldbank.org",
  "imf.org",
  "wto.org",
  "oecd.org",
  "iea.org",
  "iso.org",
  "who.int",
]);

const ACADEMIC = new Set([
  "arxiv.org",
  "nature.com",
  "science.org",
  "sciencemag.org",
  "cell.com",
  "thelancet.com",
  "nejm.org",
  "bmj.com",
  "jamanetwork.com",
  "acm.org",
  "ieee.org",
  "springer.com",
  "sciencedirect.com",
  "jstor.org",
  "ssrn.com",
  "tandfonline.com",
  "wiley.com",
  "sagepub.com",
  "frontiersin.org",
  "plos.org",
  "mdpi.com",
  "cambridge.org",
  "oup.com",
  "annualreviews.org",
  "rand.org",
  "pewresearch.org",
  "csis.org",
  "chathamhouse.org",
  "carnegieendowment.org",
  "cfr.org",
  "w3.org",
  "ietf.org",
]);

const AUTHORITATIVE_PRESS = new Set([
  "reuters.com",
  "apnews.com",
  "ft.com",
  "economist.com",
  "bloomberg.com",
  "wsj.com",
  "nytimes.com",
  "bbc.com",
  "bbc.co.uk",
  "theguardian.com",
  "caixin.com",
  "yicai.com",
  "xinhuanet.com",
  "news.cn",
  "people.com.cn",
]);

const GENERAL_MEDIA = new Set([
  "technologyreview.com",
  "wired.com",
  "theverge.com",
  "arstechnica.com",
  "techcrunch.com",
  "forbes.com",
  "fortune.com",
  "cnn.com",
  "cnbc.com",
  "axios.com",
  "politico.com",
  "statista.com",
  "wikipedia.org",
  "github.com",
  "mckinsey.com",
  "gartner.com",
  "hbr.org",
  "weforum.org",
  "36kr.com",
  "huxiu.com",
  "thepaper.cn",
  "jiemian.com",
  "sohu.com",
  "163.com",
  "qq.com",
  "sina.com.cn",
]);

const USER_GENERATED = new Set([
  "medium.com",
  "substack.com",
  "reddit.com",
  "quora.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "instagram.com",
  "zhihu.com",
  "weibo.com",
  "baijiahao.baidu.com",
  "toutiao.com",
  "jianshu.com",
  "csdn.net",
  "wordpress.com",
  "blogspot.com",
  "github.io",
  "douban.com",
  "tieba.baidu.com",
  "v2ex.com",
  "ycombinator.com",
]);

function cleanDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^www\d*\./, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

function inSet(domain: string, set: Set<string>): boolean {
  for (const item of set) {
    if (domain === item || domain.endsWith(`.${item}`)) return true;
  }
  return false;
}

export function domainTier(domain: string): SourceTier {
  const value = cleanDomain(domain);
  if (!value) return "C";
  if (
    /(^|\.)gov(\.[a-z]{2})?$/.test(value) ||
    value.endsWith(".mil") ||
    value.endsWith(".int") ||
    inSet(value, OFFICIAL)
  ) {
    return "S";
  }
  if (/(^|\.)(edu|edu\.[a-z]{2}|ac\.[a-z]{2})$/.test(value) || inSet(value, ACADEMIC)) {
    return "A";
  }
  if (inSet(value, AUTHORITATIVE_PRESS)) return "A";
  if (inSet(value, GENERAL_MEDIA)) return "B";
  if (inSet(value, USER_GENERATED)) return "C";
  return "C";
}

export function sourceTierWeight(tier: SourceTier): number {
  return SOURCE_TIER_WEIGHTS[tier];
}
