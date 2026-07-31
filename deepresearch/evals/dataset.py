"""The evaluation dataset: research topics with expected characteristics.

Kept deliberately small and self-contained. Each case carries keywords a
faithful report should plausibly mention, which powers the ``keyword_coverage``
metric without needing a gold-standard answer.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class EvalCase:
    id: str
    query: str
    # Lower-cased keywords a good report on this topic is expected to touch.
    expected_keywords: tuple[str, ...] = field(default_factory=tuple)


DEFAULT_CASES: tuple[EvalCase, ...] = (
    EvalCase(
        id="quantum-crypto",
        query="The impact of quantum computing on modern cryptography",
        expected_keywords=("qubit", "rsa", "shor", "post-quantum"),
    ),
    EvalCase(
        id="llm-agents",
        query="What are the latest advancements in autonomous LLM agents?",
        expected_keywords=("tool", "planning", "memory", "reasoning"),
    ),
    EvalCase(
        id="risc-v",
        query="RISC-V adoption in the data center in 2026",
        expected_keywords=("isa", "open", "arm", "ecosystem"),
    ),
)
