"""Evaluation suite for the research agent.

Two layers of metrics:

* **Deterministic** (``metrics``) — parse the report text and check citation
  integrity, source coverage, structure and keyword coverage. No API key or
  network needed, so these run in CI.
* **LLM-as-judge** (``judge``) — an optional model-graded layer that scores
  faithfulness (are claims grounded in the sources?) and relevance.
"""

from .dataset import DEFAULT_CASES, EvalCase
from .metrics import DeterministicScores, keyword_coverage, score_report
from .runner import CaseResult, Scorecard, run_evaluation

__all__ = [
    "DEFAULT_CASES",
    "EvalCase",
    "DeterministicScores",
    "keyword_coverage",
    "score_report",
    "CaseResult",
    "Scorecard",
    "run_evaluation",
]
