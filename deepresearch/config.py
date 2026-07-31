"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    """All tunable knobs of the agent, with sensible defaults.

    Values are read from environment variables (see ``.env.example``)
    but can also be constructed directly, which keeps tests hermetic.
    """

    model_name: str = "gpt-4o-mini"
    api_base: str | None = None
    temperature: float = 0.3
    max_iterations: int = 2
    queries_per_plan: int = 3
    results_per_query: int = 4
    max_sources: int = 24

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv()
        return cls(
            model_name=os.getenv("OPENAI_MODEL_NAME", cls.model_name),
            api_base=os.getenv("OPENAI_API_BASE") or None,
            temperature=float(os.getenv("LLM_TEMPERATURE", cls.temperature)),
            max_iterations=int(os.getenv("MAX_ITERATIONS", cls.max_iterations)),
            queries_per_plan=int(os.getenv("QUERIES_PER_PLAN", cls.queries_per_plan)),
            results_per_query=int(os.getenv("RESULTS_PER_QUERY", cls.results_per_query)),
            max_sources=int(os.getenv("MAX_SOURCES", cls.max_sources)),
        )
