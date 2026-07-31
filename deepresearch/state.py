"""Graph state and shared data structures."""

from __future__ import annotations

from typing import TypedDict


class Source(TypedDict):
    """A single web search result."""

    title: str
    url: str
    snippet: str


class AgentState(TypedDict, total=False):
    """State threaded through the LangGraph workflow.

    ``plan`` holds the queries for the *current* iteration only, while
    ``executed_queries`` accumulates everything already searched so the
    planner can avoid repeating itself across revision cycles.
    """

    query: str
    plan: list[str]
    executed_queries: list[str]
    sources: list[Source]
    draft: str
    feedback: str
    approved: bool
    iteration: int
    final_report: str
