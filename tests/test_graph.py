"""End-to-end graph tests with fake LLM and search — no network needed."""

from __future__ import annotations

from langchain_core.messages import AIMessage

from conftest import FakeLLM, fake_search_factory
from deepresearch.config import Settings
from deepresearch.graph import build_graph
from deepresearch.schemas import ReviewVerdict, SearchPlan

SETTINGS = Settings(max_iterations=2, queries_per_plan=2, results_per_query=2, max_sources=10)


def test_happy_path_single_iteration():
    """Approved on first review -> exactly one plan/search/write cycle."""
    plan_calls = []

    def plan_fn(pv):
        plan_calls.append(pv)
        return SearchPlan(queries=[f"q{len(plan_calls)}-a", f"q{len(plan_calls)}-b"])

    search_fn, search_calls = fake_search_factory()
    llm = FakeLLM(
        plan_fn=plan_fn,
        verdict_fn=lambda pv: ReviewVerdict(approved=True),
        chat_fn=lambda pv: AIMessage(content="# Great report"),
    )

    graph = build_graph(llm=llm, settings=SETTINGS, search_fn=search_fn)
    final_state = graph.invoke({"query": "test topic"})

    assert len(plan_calls) == 1
    assert search_calls == ["q1-a", "q1-b"]
    assert final_state["iteration"] == 1
    assert final_state["final_report"].startswith("# Great report")
    assert "## References" in final_state["final_report"]


def test_revision_loop_feeds_feedback_back_to_planner():
    """First review rejects -> planner runs again and sees the feedback."""
    plan_prompts = []

    def plan_fn(pv):
        plan_prompts.append(pv.to_string())
        n = len(plan_prompts)
        return SearchPlan(queries=[f"iter{n}-a", f"iter{n}-b"])

    verdicts = iter(
        [
            ReviewVerdict(approved=False, feedback="Cover pricing in detail"),
            ReviewVerdict(approved=True),
        ]
    )
    search_fn, search_calls = fake_search_factory()
    llm = FakeLLM(
        plan_fn=plan_fn,
        verdict_fn=lambda pv: next(verdicts),
        chat_fn=lambda pv: AIMessage(content="# Draft"),
    )

    graph = build_graph(llm=llm, settings=SETTINGS, search_fn=search_fn)
    final_state = graph.invoke({"query": "test topic"})

    assert len(plan_prompts) == 2
    # The second planning round must see the reviewer's feedback and the
    # queries that were already executed (the original code dropped both).
    assert "Cover pricing in detail" in plan_prompts[1]
    assert "iter1-a" in plan_prompts[1]
    assert final_state["iteration"] == 2
    assert final_state["executed_queries"] == ["iter1-a", "iter1-b", "iter2-a", "iter2-b"]
    assert final_state["final_report"]


def test_iteration_budget_terminates_run():
    """Reviewer never approves -> the run still ends at max_iterations."""
    search_fn, _ = fake_search_factory()
    llm = FakeLLM(
        verdict_fn=lambda pv: ReviewVerdict(approved=False, feedback="never happy"),
        chat_fn=lambda pv: AIMessage(content="# Draft"),
    )

    graph = build_graph(llm=llm, settings=SETTINGS, search_fn=search_fn)
    final_state = graph.invoke({"query": "test topic"})

    assert final_state["iteration"] == SETTINGS.max_iterations
    assert final_state["final_report"]
