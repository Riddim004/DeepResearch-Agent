"""Deterministic, offline report metrics.

These parse the report text and compare inline citations against the
reference list. No API key or network is required, which is what lets the
eval suite run in CI on every push.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Inline citations like [1], [2, 3] — but NOT markdown links like [Title](url).
_INLINE_CITATION = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\](?!\()")
# Numbered reference entries: lines beginning with "1. ".
_REFERENCE_ENTRY = re.compile(r"^\s*(\d+)\.\s", re.MULTILINE)
# The References heading (any level).
_REFERENCES_HEADER = re.compile(r"^#+\s*References\s*$", re.IGNORECASE | re.MULTILINE)

_REQUIRED_SECTIONS = ("introduction", "key findings", "conclusion")


@dataclass(frozen=True)
class DeterministicScores:
    """All scores are in ``[0, 1]`` unless noted; higher is better."""

    citation_validity: float  # inline citations that resolve to a real source
    citation_coverage: float  # distinct sources that were actually cited
    structure_score: float  # fraction of required sections present
    keyword_coverage: float  # fraction of expected keywords present
    has_references: bool
    num_inline_citations: int
    num_sources: int


def split_body_and_references(report: str) -> tuple[str, str]:
    """Split a report into ``(body, references)`` at the References header."""
    match = _REFERENCES_HEADER.search(report)
    if not match:
        return report, ""
    return report[: match.start()], report[match.end() :]


def parse_inline_citations(body: str) -> list[int]:
    """Return every citation number referenced inline (e.g. ``[1]``, ``[2, 3]``)."""
    numbers: list[int] = []
    for group in _INLINE_CITATION.findall(body):
        numbers.extend(int(tok.strip()) for tok in group.split(","))
    return numbers


def parse_reference_numbers(references: str) -> list[int]:
    """Return the numbers of the entries in a References section."""
    return [int(n) for n in _REFERENCE_ENTRY.findall(references)]


def keyword_coverage(report: str, keywords: tuple[str, ...]) -> float:
    """Fraction of ``keywords`` that appear (case-insensitively) in the report."""
    if not keywords:
        return 1.0
    text = report.lower()
    hits = sum(1 for kw in keywords if kw.lower() in text)
    return hits / len(keywords)


def score_report(
    report: str,
    num_sources: int,
    expected_keywords: tuple[str, ...] = (),
) -> DeterministicScores:
    """Compute all deterministic metrics for a single report."""
    body, references = split_body_and_references(report)
    inline = parse_inline_citations(body)

    valid = [n for n in inline if 1 <= n <= num_sources]
    citation_validity = len(valid) / len(inline) if inline else 0.0

    distinct_cited = set(valid)
    citation_coverage = len(distinct_cited) / num_sources if num_sources else 0.0

    body_lower = body.lower()
    present = sum(1 for section in _REQUIRED_SECTIONS if section in body_lower)
    structure_score = present / len(_REQUIRED_SECTIONS)

    return DeterministicScores(
        citation_validity=citation_validity,
        citation_coverage=citation_coverage,
        structure_score=structure_score,
        keyword_coverage=keyword_coverage(report, expected_keywords),
        has_references=bool(references.strip()),
        num_inline_citations=len(inline),
        num_sources=num_sources,
    )
