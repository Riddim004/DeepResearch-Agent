"""Unit tests for individual nodes and pure helpers."""

from __future__ import annotations

from langchain_core.messages import AIMessage

from conftest import FakeLLM, fake_search_factory, make_source
from deepresearch.config import Settings
from deepresearch.nodes import ResearchNodes
from deepresearch.schemas import ReviewVerdict, SearchPlan
from deepresearch.search import merge_sources

SETTINGS = Settings(max_iterations=2, queries_per_plan=3, results_per_query=2, max_sources=5)


# -- merge_sources ------------------------------------------------------

def test_merge_sources_deduplicates_by_url():
    existing = [make_source(1)]
    new = [make_source(1), make_source(2)]
    merged = merge_sources(existing, new, cap=10)
    assert [s["url"] for s in merged] == [
        "https://example.com/1",
        "https://example.com/2",
    ]


def test_merge_sources_respects_cap_and_does_not_mutate():
    existing = [make_source(1), make_source(2)]
    new = [make_source(n) for n in range(3, 10)]
    merged = merge_sources(existing, new, cap=4)
    assert len(merged) == 4
    assert len(existing) == 2  # input untouched


# -- planner ------------------------------------------------------------

def test_planner_receives_feedback_and_executed_queries():
    captured = {}

    def plan_fn(prompt_value):
        captured["prompt"] = prompt_value.to_string()
        return SearchPlan(queries=["  q-new  ", ""])

    nodes = ResearchNodes(FakeLLM(plan_fn=plan_fn), settings=SETTINGS)
    update = nodes.plan(
        {
            "query": "topic X",
            "iteration": 1,
            "feedback": "Missing cost analysis",
            "executed_queries": ["old query"],
        }
    )

    assert update["iteration"] == 2
    assert update["plan"] == ["q-new"]  # trimmed, empties dropped
    assert "Missing cost analysis" in captured["prompt"]
    assert "old query" in captured["prompt"]


def test_planner_caps_query_count():
    plan_fn = lambda pv: SearchPlan(queries=["a", "b", "c", "d", "e"])
    nodes = ResearchNodes(FakeLLM(plan_fn=plan_fn), settings=SETTINGS)
    update = nodes.plan({"query": "topic"})
    assert len(update["plan"]) == SETTINGS.queries_per_plan


# -- searcher -----------------------------------------------------------

def test_search_accumulates_executed_queries_and_dedupes():
    search_fn, calls = fake_search_factory(per_query=2)
    nodes = ResearchNodes(FakeLLM(), settings=SETTINGS, search_fn=search_fn)
    update = nodes.search(
        {"plan": ["q1", "q2"], "executed_queries": ["q0"], "sources": [make_source(10)]}
    )

    assert calls == ["q1", "q2"]
    assert update["executed_queries"] == ["q0", "q1", "q2"]
    urls = [s["url"] for s in update["sources"]]
    assert len(urls) == len(set(urls))  # no duplicates
    assert len(urls) <= SETTINGS.max_sources


# -- writer -------------------------------------------------------------

def test_writer_includes_revision_context_when_revising():
    captured = {}

    def chat_fn(prompt_value):
        captured["prompt"] = prompt_value.to_string()
        return AIMessage(content="revised draft")

    nodes = ResearchNodes(FakeLLM(chat_fn=chat_fn), settings=SETTINGS)
    update = nodes.write(
        {
            "query": "topic",
            "sources": [make_source(1)],
            "draft": "old draft",
            "feedback": "add more depth",
        }
    )

    assert update["draft"] == "revised draft"
    assert "old draft" in captured["prompt"]
    assert "add more depth" in captured["prompt"]
    assert "[1] Source 1" in captured["prompt"]


# -- reviewer / routing --------------------------------------------------

def test_review_returns_structured_verdict():
    verdict_fn = lambda pv: ReviewVerdict(approved=False, feedback="needs sources")
    nodes = ResearchNodes(FakeLLM(verdict_fn=verdict_fn), settings=SETTINGS)
    update = nodes.review({"query": "t", "draft": "d"})
    assert update == {"approved": False, "feedback": "needs sources"}


def test_route_finalizes_on_approval():
    nodes = ResearchNodes(FakeLLM(), settings=SETTINGS)
    assert nodes.route_after_review({"approved": True, "iteration": 1}) == "finalize"


def test_route_revises_below_iteration_budget():
    nodes = ResearchNodes(FakeLLM(), settings=SETTINGS)
    assert nodes.route_after_review({"approved": False, "iteration": 1}) == "revise"


def test_route_finalizes_when_budget_exhausted():
    nodes = ResearchNodes(FakeLLM(), settings=SETTINGS)
    assert nodes.route_after_review({"approved": False, "iteration": 2}) == "finalize"


# -- finalizer ----------------------------------------------------------

def test_finalize_appends_references_section():
    nodes = ResearchNodes(FakeLLM(), settings=SETTINGS)
    update = nodes.finalize({"draft": "# Report", "sources": [make_source(1)]})
    assert "## References" in update["final_report"]
    assert "https://example.com/1" in update["final_report"]


def test_finalize_keeps_existing_references():
    nodes = ResearchNodes(FakeLLM(), settings=SETTINGS)
    draft = "# Report\n\n## References\n\n1. something"
    update = nodes.finalize({"draft": draft, "sources": [make_source(1)]})
    assert update["final_report"] == draft
