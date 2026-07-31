"""LLM-as-judge: model-graded faithfulness and relevance.

This is the optional, API-backed layer of the eval suite. It grades a report
the way a human reviewer would, but structured so the scores are machine
usable. The LLM is injected, so the judge is testable with a fake.
"""

from __future__ import annotations

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from ..state import Source


class JudgeVerdict(BaseModel):
    """Structured grade returned by the LLM judge."""

    faithfulness: float = Field(
        ge=0.0,
        le=1.0,
        description="How well the report's claims are grounded in the given sources (1.0 = fully grounded).",
    )
    relevance: float = Field(
        ge=0.0,
        le=1.0,
        description="How well the report answers the research query (1.0 = fully on-topic and complete).",
    )
    rationale: str = Field(default="", description="Brief justification for the scores.")


JUDGE_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are a strict evaluator of research reports. You are given a research "
            "query, the report, and the sources the report was written from.\n"
            "Score two dimensions from 0.0 to 1.0:\n"
            "- faithfulness: are the report's factual claims supported by the sources? "
            "Penalise anything not traceable to a source.\n"
            "- relevance: does the report actually answer the query, with adequate coverage?\n"
            "Be critical and give a short rationale.",
        ),
        (
            "human",
            "Query:\n{query}\n\nSources:\n{sources}\n\nReport:\n{report}",
        ),
    ]
)


class LLMJudge:
    """Grades a report against its query and sources using an injected LLM."""

    def __init__(self, llm) -> None:
        self._chain = JUDGE_PROMPT | llm.with_structured_output(JudgeVerdict)

    def score(self, query: str, report: str, sources: list[Source]) -> JudgeVerdict:
        context = "\n\n".join(
            f"[{i}] {s['title']}\n{s['snippet']}" for i, s in enumerate(sources, 1)
        ) or "No sources."
        return self._chain.invoke(
            {"query": query, "report": report, "sources": context}
        )
