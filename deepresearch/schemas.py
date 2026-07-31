"""Pydantic schemas for structured LLM outputs.

Using ``llm.with_structured_output`` removes the fragile string parsing
(``strip('-*1234567890. ')`` and ``"APPROVED" in feedback``) that the
original implementation relied on.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class SearchPlan(BaseModel):
    """Structured output of the planner node."""

    queries: list[str] = Field(
        description="Distinct, self-contained web search queries.",
        min_length=1,
        max_length=5,
    )


class ReviewVerdict(BaseModel):
    """Structured output of the reviewer node."""

    approved: bool = Field(
        description="True only if the draft fully and accurately covers the research topic."
    )
    feedback: str = Field(
        default="",
        description="Specific, actionable feedback describing what is missing or wrong. Empty when approved.",
    )
