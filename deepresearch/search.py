"""Web search tooling: DuckDuckGo wrapper and pure merge helpers."""

from __future__ import annotations

import logging

from .state import Source

logger = logging.getLogger(__name__)

try:  # the PyPI package was renamed from duckduckgo_search to ddgs
    from ddgs import DDGS
except ImportError:  # pragma: no cover - legacy fallback
    from duckduckgo_search import DDGS


def duckduckgo_search(query: str, max_results: int = 4) -> list[Source]:
    """Run a single DuckDuckGo text search.

    Failures are logged and swallowed so that one bad query never kills
    the whole research run.
    """
    try:
        with DDGS() as ddgs:
            raw = list(ddgs.text(query, max_results=max_results))
    except Exception:
        logger.exception("Search failed for query: %s", query)
        return []
    return [
        Source(
            title=r.get("title", ""),
            url=r.get("href", ""),
            snippet=r.get("body", ""),
        )
        for r in raw
        if r.get("href")
    ]


def merge_sources(existing: list[Source], new: list[Source], cap: int) -> list[Source]:
    """Merge ``new`` into ``existing`` without mutating either list.

    Deduplicates by URL and caps the total so revision cycles cannot
    grow the LLM context without bound (a bug in the original version).
    """
    merged = list(existing)
    seen = {s["url"] for s in merged}
    for source in new:
        if len(merged) >= cap:
            break
        if source["url"] in seen:
            continue
        merged.append(source)
        seen.add(source["url"])
    return merged
