"""LangGraph node implementations.

All nodes live on :class:`ResearchNodes`, which takes the LLM and the
search function as constructor arguments. Dependency injection keeps the
nodes unit-testable without network access or API keys.
"""

from __future__ import annotations

import logging
from typing import Callable

from langchain_core.prompts import ChatPromptTemplate

from .config import Settings
from .schemas import ReviewVerdict, SearchPlan
from .search import duckduckgo_search, merge_sources
from .state import AgentState, Source

logger = logging.getLogger(__name__)

PLANNER_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are an expert research assistant. Break the user's research topic "
            "into at most {n} distinct, self-contained web search queries that together "
            "give comprehensive coverage.\n\n"
            "Queries already executed (do NOT repeat or trivially rephrase them):\n{executed}\n\n"
            "Reviewer feedback on the previous draft (address the gaps it points out):\n{feedback}",
        ),
        ("human", "Research topic: {topic}"),
    ]
)

WRITER_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are a senior research analyst. Write a well-structured Markdown report "
            "on the given topic using ONLY the numbered sources provided.\n"
            "Requirements:\n"
            "- Sections: Introduction, Key Findings, Conclusion.\n"
            "- Cite sources inline with bracketed numbers, e.g. [1], matching the source list.\n"
            "- If the sources are insufficient for part of the topic, say so explicitly "
            "instead of inventing facts.\n"
            "{revision}",
        ),
        ("human", "Topic: {topic}\n\nSources:\n{context}"),
    ]
)

REVIEWER_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are a demanding editor. Judge whether the draft fully and accurately "
            "answers the research topic. Approve only if coverage, structure and "
            "citations are all solid. When rejecting, give specific, actionable feedback.",
        ),
        ("human", "Topic: {topic}\n\nDraft:\n{draft}"),
    ]
)

SearchFn = Callable[[str, int], list[Source]]


class ResearchNodes:
    """Node implementations bound to an LLM, settings and a search tool."""

    def __init__(
        self,
        llm,
        settings: Settings | None = None,
        search_fn: SearchFn = duckduckgo_search,
    ) -> None:
        self.settings = settings or Settings.from_env()
        self.search_fn = search_fn
        self._planner = PLANNER_PROMPT | llm.with_structured_output(SearchPlan)
        self._writer = WRITER_PROMPT | llm
        self._reviewer = REVIEWER_PROMPT | llm.with_structured_output(ReviewVerdict)

    # -- nodes ---------------------------------------------------------

    def plan(self, state: AgentState) -> dict:
        """Generate search queries, informed by reviewer feedback on revision."""
        iteration = state.get("iteration", 0) + 1
        executed = state.get("executed_queries", [])
        result: SearchPlan = self._planner.invoke(
            {
                "topic": state["query"],
                "n": self.settings.queries_per_plan,
                "executed": "\n".join(executed) or "None",
                "feedback": state.get("feedback") or "None - this is the first pass.",
            }
        )
        queries = [q.strip() for q in result.queries if q.strip()]
        queries = queries[: self.settings.queries_per_plan]
        logger.info("Iteration %d plan: %s", iteration, queries)
        return {"plan": queries, "iteration": iteration}

    def search(self, state: AgentState) -> dict:
        """Execute the current plan and merge deduplicated results."""
        plan = state.get("plan", [])
        found: list[Source] = []
        for query in plan:
            found.extend(self.search_fn(query, self.settings.results_per_query))
        sources = merge_sources(
            state.get("sources", []), found, self.settings.max_sources
        )
        logger.info("Collected %d unique sources so far", len(sources))
        return {
            "sources": sources,
            "executed_queries": state.get("executed_queries", []) + plan,
            "plan": [],
        }

    def write(self, state: AgentState) -> dict:
        """Draft (or revise) the report with inline citations."""
        sources = state.get("sources", [])
        context = "\n\n".join(
            f"[{i}] {s['title']}\nURL: {s['url']}\n{s['snippet']}"
            for i, s in enumerate(sources, 1)
        ) or "No sources were found."

        revision = ""
        if state.get("draft") and state.get("feedback"):
            revision = (
                "\nYou are REVISING a previous draft. Keep what was good, and fix "
                "the issues raised by the reviewer.\n"
                f"Previous draft:\n{state['draft']}\n\n"
                f"Reviewer feedback:\n{state['feedback']}"
            )

        response = self._writer.invoke(
            {"topic": state["query"], "context": context, "revision": revision}
        )
        return {"draft": response.content}

    def review(self, state: AgentState) -> dict:
        """Return a structured approve/reject verdict on the draft."""
        verdict: ReviewVerdict = self._reviewer.invoke(
            {"topic": state["query"], "draft": state.get("draft", "")}
        )
        logger.info("Review verdict: approved=%s", verdict.approved)
        return {"approved": verdict.approved, "feedback": verdict.feedback}

    def finalize(self, state: AgentState) -> dict:
        """Assemble the final report, appending a References section if missing."""
        report = state.get("draft", "")
        sources = state.get("sources", [])
        if sources and "## References" not in report:
            refs = "\n".join(
                f"{i}. [{s['title'] or s['url']}]({s['url']})"
                for i, s in enumerate(sources, 1)
            )
            report = f"{report}\n\n## References\n\n{refs}"
        return {"final_report": report}

    # -- routing -------------------------------------------------------

    def route_after_review(self, state: AgentState) -> str:
        """Finalize when approved or when the iteration budget is spent."""
        if state.get("approved"):
            return "finalize"
        if state.get("iteration", 0) >= self.settings.max_iterations:
            logger.info("Max iterations reached; finalizing despite rejection.")
            return "finalize"
        return "revise"
