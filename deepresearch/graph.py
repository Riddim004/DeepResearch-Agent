"""Workflow assembly: wires the nodes into a LangGraph state machine."""

from __future__ import annotations

from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph

from .config import Settings
from .nodes import ResearchNodes, SearchFn
from .state import AgentState


def make_llm(settings: Settings) -> ChatOpenAI:
    """Create the chat model, honouring OpenAI-compatible overrides."""
    kwargs: dict = {
        "model": settings.model_name,
        "temperature": settings.temperature,
    }
    if settings.api_base:
        kwargs["base_url"] = settings.api_base
    return ChatOpenAI(**kwargs)


def build_graph(
    llm=None,
    settings: Settings | None = None,
    search_fn: SearchFn | None = None,
):
    """Compile the research workflow.

    ``llm`` and ``search_fn`` are injectable so the full graph can run
    under test with fakes (see ``tests/``).
    """
    settings = settings or Settings.from_env()
    llm = llm or make_llm(settings)
    node_kwargs: dict = {"settings": settings}
    if search_fn is not None:
        node_kwargs["search_fn"] = search_fn
    nodes = ResearchNodes(llm, **node_kwargs)

    workflow = StateGraph(AgentState)
    workflow.add_node("planner", nodes.plan)
    workflow.add_node("searcher", nodes.search)
    workflow.add_node("writer", nodes.write)
    workflow.add_node("reviewer", nodes.review)
    workflow.add_node("finalizer", nodes.finalize)

    workflow.set_entry_point("planner")
    workflow.add_edge("planner", "searcher")
    workflow.add_edge("searcher", "writer")
    workflow.add_edge("writer", "reviewer")
    workflow.add_conditional_edges(
        "reviewer",
        nodes.route_after_review,
        {"revise": "planner", "finalize": "finalizer"},
    )
    workflow.add_edge("finalizer", END)

    return workflow.compile()
