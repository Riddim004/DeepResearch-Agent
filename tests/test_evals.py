"""Tests for the evaluation suite (metrics, judge, runner)."""

from __future__ import annotations

from conftest import FakeLLM, make_source
from deepresearch.evals.dataset import EvalCase
from deepresearch.evals.judge import JudgeVerdict, LLMJudge
from deepresearch.evals.metrics import (
    keyword_coverage,
    parse_inline_citations,
    parse_reference_numbers,
    score_report,
    split_body_and_references,
)
from deepresearch.evals.runner import run_evaluation

GOOD_REPORT = """# Report

## Introduction
Quantum computers threaten RSA [1].

## Key Findings
Shor's algorithm breaks RSA [1][2]. Post-quantum schemes help [3].

## Conclusion
Migration is urgent [2, 3].

## References

1. [Source 1](https://example.com/1)
2. [Source 2](https://example.com/2)
3. [Source 3](https://example.com/3)
"""


# -- parsing ------------------------------------------------------------

def test_split_body_and_references():
    body, refs = split_body_and_references(GOOD_REPORT)
    assert "Introduction" in body
    assert "References" not in body
    assert "Source 1" in refs


def test_parse_inline_citations_handles_lists_and_ignores_links():
    body, _ = split_body_and_references(GOOD_REPORT)
    cites = parse_inline_citations(body)
    # [1], [1][2], [3], [2, 3]  ->  1,1,2,3,2,3
    assert sorted(cites) == [1, 1, 2, 2, 3, 3]


def test_parse_reference_numbers():
    _, refs = split_body_and_references(GOOD_REPORT)
    assert parse_reference_numbers(refs) == [1, 2, 3]


def test_keyword_coverage():
    assert keyword_coverage("has RSA and Shor", ("rsa", "shor", "qubit")) == 2 / 3
    assert keyword_coverage("anything", ()) == 1.0


# -- score_report -------------------------------------------------------

def test_score_report_on_well_formed_report():
    scores = score_report(GOOD_REPORT, num_sources=3, expected_keywords=("rsa", "shor"))
    assert scores.citation_validity == 1.0  # every [n] resolves to a source
    assert scores.citation_coverage == 1.0  # all 3 sources cited
    assert scores.structure_score == 1.0  # all sections present
    assert scores.keyword_coverage == 1.0
    assert scores.has_references is True


def test_score_report_detects_hallucinated_citation():
    # [5] has no matching source when only 3 exist.
    report = "## Introduction\nClaim [5].\n\n## References\n\n1. [x](u)"
    scores = score_report(report, num_sources=3)
    assert scores.citation_validity == 0.0
    assert scores.citation_coverage == 0.0


def test_score_report_partial_structure_and_no_refs():
    report = "## Introduction\nSome text [1]."
    scores = score_report(report, num_sources=2)
    assert scores.has_references is False
    assert scores.structure_score == 1 / 3  # only Introduction present
    assert scores.citation_coverage == 1 / 2  # 1 of 2 sources cited


# -- judge --------------------------------------------------------------

def test_llm_judge_returns_structured_verdict():
    captured = {}

    def judge_fn(prompt_value):
        captured["prompt"] = prompt_value.to_string()
        return JudgeVerdict(faithfulness=0.8, relevance=0.9, rationale="mostly grounded")

    judge = LLMJudge(FakeLLM(judge_fn=judge_fn))
    verdict = judge.score("my query", "the report", [make_source(1)])

    assert verdict.faithfulness == 0.8
    assert verdict.relevance == 0.9
    assert "my query" in captured["prompt"]
    assert "the report" in captured["prompt"]


# -- runner -------------------------------------------------------------

def test_run_evaluation_with_fake_producer_and_no_judge():
    cases = (
        EvalCase("c1", "topic one", ("alpha",)),
        EvalCase("c2", "topic two", ("beta",)),
    )

    def producer(query):
        report = (
            "## Introduction\nAlpha and beta [1].\n\n"
            "## Key Findings\nMore [2].\n\n## Conclusion\nDone.\n\n"
            "## References\n\n1. [a](u1)\n2. [b](u2)"
        )
        return report, [make_source(1), make_source(2)]

    scorecard = run_evaluation(cases=cases, producer=producer)
    assert len(scorecard.results) == 2
    agg = scorecard.aggregate()
    assert agg["citation_validity"] == 1.0
    assert "faithfulness" not in agg  # no judge -> no model-graded metrics
    assert "| Case |" in scorecard.to_markdown()


def test_run_evaluation_with_judge_adds_model_graded_metrics():
    cases = (EvalCase("c1", "topic one"),)

    def producer(query):
        return "## Introduction\ntext [1]\n\n## References\n\n1. [a](u)", [make_source(1)]

    judge = LLMJudge(
        FakeLLM(judge_fn=lambda pv: JudgeVerdict(faithfulness=0.7, relevance=0.6))
    )
    scorecard = run_evaluation(cases=cases, producer=producer, judge=judge)
    agg = scorecard.aggregate()
    assert agg["faithfulness"] == 0.7
    assert agg["relevance"] == 0.6
    md = scorecard.to_markdown()
    assert "Faithful" in md and "Relevant" in md
