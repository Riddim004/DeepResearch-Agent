"""Shared test fakes: an LLM double and a canned search function.

``FakeLLM`` mimics the two capabilities of ``ChatOpenAI`` that the nodes
rely on: being piped after a prompt (plain chat for the writer) and
``with_structured_output`` (planner / reviewer). No network, no API key.
"""

from __future__ import annotations

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

from deepresearch.evals.judge import JudgeVerdict
from deepresearch.schemas import ReviewVerdict, SearchPlan
from deepresearch.state import Source


class FakeLLM:
    """Configurable stand-in for a chat model.

    Each ``*_fn`` receives the formatted ``PromptValue``, which lets
    tests assert on the exact prompt the node produced.
    """

    def __init__(self, plan_fn=None, verdict_fn=None, chat_fn=None, judge_fn=None):
        self.plan_fn = plan_fn or (lambda pv: SearchPlan(queries=["default query"]))
        self.verdict_fn = verdict_fn or (lambda pv: ReviewVerdict(approved=True))
        self.chat_fn = chat_fn or (lambda pv: AIMessage(content="# Draft report"))
        self.judge_fn = judge_fn or (
            lambda pv: JudgeVerdict(faithfulness=1.0, relevance=1.0, rationale="ok")
        )

    def with_structured_output(self, schema):
        if schema is SearchPlan:
            return RunnableLambda(self.plan_fn)
        if schema is ReviewVerdict:
            return RunnableLambda(self.verdict_fn)
        if schema is JudgeVerdict:
            return RunnableLambda(self.judge_fn)
        raise ValueError(f"Unexpected schema: {schema}")

    def __call__(self, prompt_value, **kwargs):
        # Plain chat path (writer chain): prompt | llm
        return self.chat_fn(prompt_value)


def make_source(n: int) -> Source:
    return Source(
        title=f"Source {n}",
        url=f"https://example.com/{n}",
        snippet=f"Snippet {n}",
    )


def fake_search_factory(per_query: int = 2):
    """Return a deterministic search function plus its call log."""
    calls: list[str] = []

    def fake_search(query: str, max_results: int) -> list[Source]:
        calls.append(query)
        base = len(calls) * 10
        return [make_source(base + i) for i in range(per_query)]

    return fake_search, calls
