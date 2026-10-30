import { describe, expect, it } from "vitest";

import { domainTier, SOURCE_TIER_WEIGHTS, sourceTierWeight } from "../src/source-tier";

describe("domainTier", () => {
  it("classifies official and primary records as S", () => {
    expect(domainTier("www.gov.cn")).toBe("S");
    expect(domainTier("nist.gov")).toBe("S");
    expect(domainTier("oecd.org")).toBe("S");
    expect(domainTier("europa.eu")).toBe("S");
  });

  it("classifies academic and authoritative sources as A", () => {
    expect(domainTier("arxiv.org")).toBe("A");
    expect(domainTier("nature.com")).toBe("A");
    expect(domainTier("hai.stanford.edu")).toBe("A");
    expect(domainTier("reuters.com")).toBe("A");
    expect(domainTier("www.caixin.com")).toBe("A");
  });

  it("classifies established media as B and unrated or UGC as C", () => {
    expect(domainTier("technologyreview.com")).toBe("B");
    expect(domainTier("github.com")).toBe("B");
    expect(domainTier("36kr.com")).toBe("B");
    expect(domainTier("zhihu.com")).toBe("C");
    expect(domainTier("some-unknown-blog.example")).toBe("C");
  });

  it("normalizes ports, casing, and www prefixes", () => {
    expect(domainTier("WWW.NIST.GOV:443")).toBe("S");
    expect(domainTier("news.arxiv.org")).toBe("A");
  });

  it("keeps tier weights ordered", () => {
    expect(SOURCE_TIER_WEIGHTS.S).toBeGreaterThan(SOURCE_TIER_WEIGHTS.A);
    expect(SOURCE_TIER_WEIGHTS.A).toBeGreaterThan(SOURCE_TIER_WEIGHTS.B);
    expect(SOURCE_TIER_WEIGHTS.B).toBeGreaterThan(SOURCE_TIER_WEIGHTS.C);
    expect(sourceTierWeight("A")).toBe(SOURCE_TIER_WEIGHTS.A);
  });
});
