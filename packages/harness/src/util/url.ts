const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "source",
  "spm",
  "yclid",
  "igshid",
]);

export function normalizeUrl(input: string, base?: string): string | null {
  try {
    const url = base ? new URL(input, base) : new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.pathname === "/" && !url.search) url.pathname = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function domainOf(input: string): string {
  try {
    return new URL(input).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isAcademicDomain(domain: string): boolean {
  return (
    domain.endsWith(".edu") ||
    domain.endsWith(".gov") ||
    domain.endsWith(".ac.uk") ||
    domain.endsWith(".org") ||
    /(^|\.)(arxiv\.org|nature\.com|science\.org|pubmed\.ncbi\.nlm\.nih\.gov|who\.int|oecd\.org|worldbank\.org)$/.test(
      domain,
    )
  );
}

export function decodeDuckDuckGoUrl(href: string): string {
  try {
    if (href.startsWith("//")) href = `https:${href}`;
    const url = new URL(href, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url.toString();
  } catch {
    return href;
  }
}
