"""Evaluation runner: produce reports, score them, aggregate a scorecard."""

from __future__ import annotations

from dataclasses import dataclass
from statistics import mean
from typing import Callable, Optional

from ..state import Source
from .dataset import DEFAULT_CASES, EvalCase
from .judge import JudgeVerdict, LLMJudge
from .metrics import DeterministicScores, score_report

# Given a query, return the produced report and the sources it used.
ReportProducer = Callable[[str], tuple[str, list[Source]]]


@dataclass
class CaseResult:
    case: EvalCase
    scores: DeterministicScores
    judge: Optional[JudgeVerdict] = None


@dataclass
class Scorecard:
    results: list[CaseResult]

    def aggregate(self) -> dict[str, float]:
        """Mean of every metric across all cases."""
        if not self.results:
            return {}
        agg = {
            "citation_validity": mean(r.scores.citation_validity for r in self.results),
            "citation_coverage": mean(r.scores.citation_coverage for r in self.results),
            "structure_score": mean(r.scores.structure_score for r in self.results),
            "keyword_coverage": mean(r.scores.keyword_coverage for r in self.results),
            "has_references": mean(
                1.0 if r.scores.has_references else 0.0 for r in self.results
            ),
        }
        judged = [r.judge for r in self.results if r.judge is not None]
        if judged:
            agg["faithfulness"] = mean(v.faithfulness for v in judged)
            agg["relevance"] = mean(v.relevance for v in judged)
        return agg

    def to_markdown(self) -> str:
        """Render a human-readable scorecard."""
        judged = any(r.judge is not None for r in self.results)
        header = ["Case", "Cite valid", "Cite cover", "Structure", "Keywords", "Refs"]
        if judged:
            header += ["Faithful", "Relevant"]
        lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
        for r in self.results:
            row = [
                r.case.id,
                f"{r.scores.citation_validity:.2f}",
                f"{r.scores.citation_coverage:.2f}",
                f"{r.scores.structure_score:.2f}",
                f"{r.scores.keyword_coverage:.2f}",
                "✓" if r.scores.has_references else "✗",
            ]
            if judged:
                row += (
                    [f"{r.judge.faithfulness:.2f}", f"{r.judge.relevance:.2f}"]
                    if r.judge
                    else ["-", "-"]
                )
            lines.append("| " + " | ".join(row) + " |")

        agg = self.aggregate()
        lines.append("")
        lines.append("**Averages:** " + ", ".join(f"{k} {v:.2f}" for k, v in agg.items()))
        return "\n".join(lines)


def _default_producer(query: str) -> tuple[str, list[Source]]:
    """Run the real agent to produce a report (requires an API key)."""
    from ..graph import build_graph  # local import to avoid API deps at import time

    state = build_graph().invoke({"query": query})
    return state.get("final_report", ""), state.get("sources", [])


def run_evaluation(
    cases: tuple[EvalCase, ...] = DEFAULT_CASES,
    producer: ReportProducer = _default_producer,
    judge: Optional[LLMJudge] = None,
) -> Scorecard:
    """Evaluate every case and return an aggregated scorecard.

    ``producer`` and ``judge`` are injectable, so the whole pipeline runs
    under test with fakes and no network.
    """
    results: list[CaseResult] = []
    for case in cases:
        report, sources = producer(case.query)
        scores = score_report(report, len(sources), case.expected_keywords)
        verdict = judge.score(case.query, report, sources) if judge else None
        results.append(CaseResult(case=case, scores=scores, judge=verdict))
    return Scorecard(results)
