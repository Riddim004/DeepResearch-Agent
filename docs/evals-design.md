# Evaluating the DeepResearch Agent — Design Notes

> Design rationale for the `deepresearch.evals` package. This documents *why*
> the evaluation suite is built the way it is, not just what it does. If you
> only read the code, you see the *what*; this file is the *why*.

## Why evaluate an agent at all?

An LLM agent is a stochastic system wrapped around a non-deterministic model.
"It looked good when I tried it" is not an engineering claim — it doesn't
survive a prompt change, a model swap, or a refactor. Once I fixed the agent's
control flow (the reviewer loop, citations, de-duplication), the obvious next
question was: *how do I know a change makes reports better and not worse?*

So I treat report quality as something to **measure**, not assert. The eval
suite is the regression net: run it, get numbers, compare before/after.

## Design goals

1. **Most of the signal must be free.** The core metrics run with no API key
   and no network, so they execute in CI on every push. Model-graded scoring is
   valuable but slow, costly and non-deterministic — it can't be the only layer.
2. **Deterministic first, model-graded second.** Anything I can check by parsing
   the text, I check by parsing the text. I only reach for an LLM judge for the
   genuinely fuzzy questions (is this *faithful*? is this *relevant*?).
3. **Testable end-to-end.** The pipeline is dependency-injected so the whole
   thing runs under `pytest` with fakes — the eval code itself has tests.

## Two layers

| Layer | Needs API? | Deterministic? | Answers |
| --- | --- | --- | --- |
| Deterministic metrics | No | Yes | Is the report *well-formed and grounded in structure*? |
| LLM-as-judge | Yes | No | Is the report *faithful and relevant* in substance? |

---

## Layer 1 — Deterministic metrics

All of these live in [`metrics.py`](../deepresearch/evals/metrics.py) as pure
functions. Pure functions are trivially testable: given a report string and a
source count, they return the same scores every time.

### Parsing the report first

Before scoring I split the report into `(body, references)` at the
`## References` heading. This matters because the two halves need different
treatment: inline citations live in the body, and the numbered source list
lives in the references. Scoring them together would double-count.

Two regexes do the parsing:

- Inline citations: `\[(\d+(?:\s*,\s*\d+)*)\](?!\()` — matches `[1]` and
  `[2, 3]`, but the negative lookahead `(?!\()` **deliberately excludes**
  markdown links like `[Title](url)`. Without it, every reference-list link
  would be miscounted as a citation.
- Reference entries: `^\s*(\d+)\.\s` — the numbered lines in the references.

### `citation_validity` — the anti-hallucination metric

```
valid = [n for n in inline_citations if 1 <= n <= num_sources]
citation_validity = len(valid) / len(inline_citations)      # 0.0 if none
```

This is the metric I care about most. It asks: **does every `[n]` in the report
point to a source that actually exists?** A model that writes "quantum computers
break RSA [7]" when only 3 sources were retrieved has *hallucinated a citation* —
`[7]` resolves to nothing. That's exactly the failure a research agent must not
have, and this catches it with zero API cost.

**Design choice worth defending:** if a report has *no* citations at all, I
return `0.0`, not "N/A". A research report with no traceable claims has failed
its core job, so I penalise it. The tradeoff: fluent, correct prose that simply
forgot to cite scores 0 here — which is intentional, because I want to reward
traceability, not just readability.

### `citation_coverage` — did the evidence get used?

```
citation_coverage = len(set(valid)) / num_sources            # 0.0 if no sources
```

How much of the gathered evidence actually made it into the report. I use the
*distinct* set of cited sources so citing `[1]` five times doesn't inflate the
score. Low coverage is a smell: it means the searcher pulled sources the writer
ignored — wasted retrieval, or overly narrow synthesis. I treat this as
*directional*, not a hard target: 100% isn't the goal (some sources are junk),
but 10% usually signals a problem.

### `structure_score` — is it shaped like a report?

Fraction of the required sections (`introduction`, `key findings`,
`conclusion`) present in the body. **Honest limitation:** it's a case-insensitive
substring check, so it would match the word "introduction" in prose, not only a
heading. I accepted that simplicity for now; the stricter version would parse
markdown headings. Worth mentioning in an interview as a known tradeoff.

### `keyword_coverage` — topical coverage without a gold answer

I don't have a reference "correct answer" for each topic (writing those by hand
doesn't scale). Instead each `EvalCase` carries a few keywords a competent report
on that topic should plausibly touch (e.g. quantum-crypto → `qubit`, `rsa`,
`shor`, `post-quantum`). The metric is the fraction present.

**Honest limitation:** keyword presence ≠ correct discussion, and it's gameable.
It's a cheap proxy for "did we stay on topic", not a correctness measure — which
is precisely why Layer 2 exists.

---

## Layer 2 — LLM-as-judge

Some questions can't be answered by regex: *are the claims actually supported by
the sources?* (faithfulness) and *does this answer the question?* (relevance).
For those I use a model as a grader — [`judge.py`](../deepresearch/evals/judge.py).

### Structured verdict

```python
class JudgeVerdict(BaseModel):
    faithfulness: float = Field(ge=0.0, le=1.0)   # claims grounded in sources
    relevance: float    = Field(ge=0.0, le=1.0)   # answers the query
    rationale: str
```

I score on `[0, 1]` and force **structured output** via Pydantic. This is the
same lesson as the main agent: never parse free text like `"score: 8/10"` out of
a model. The schema also bounds the values, so a malformed grade fails loudly
instead of silently corrupting the aggregate.

### The prompt

The judge gets the query, the numbered sources, and the report, and is told to
be strict — to penalise any claim not traceable to a source. Giving it the
sources is the key: faithfulness is meaningless unless the judge can see what the
report was *supposed* to be grounded in.

### Known limitations (and I know them)

- **Non-determinism:** the judge is an LLM, so scores wobble run to run. Mitigate
  with low temperature and by reading trends, not single decimals.
- **Self-preference bias:** if the same model family writes *and* grades, it may
  flatter its own style. The honest fix is to judge with a *different* model.
- **Cost / speed:** every judged case is extra API calls, which is why it's
  opt-in (`--judge`) and never part of CI.

I treat judge scores as **directional evidence**, not ground truth.

---

## Making it testable: dependency injection

The runner ([`runner.py`](../deepresearch/evals/runner.py)) never hard-codes
where reports come from:

```python
ReportProducer = Callable[[str], tuple[str, list[Source]]]

def run_evaluation(cases, producer=_default_producer, judge=None) -> Scorecard:
    ...
```

- In production, `producer` runs the real agent.
- In tests, I inject a fake `producer` that returns a canned report + sources,
  and a `FakeLLM` judge. That's how the eval suite gets tested **without an API
  key or network** — the same discipline as the agent's own tests.

This is the single most important design decision in the whole suite: *the thing
that measures quality is itself covered by tests.*

## Aggregation & the scorecard

`Scorecard.aggregate()` is just the mean of each metric across cases, and
`to_markdown()` renders a table. Deliberately boring — the value is in the
metrics, not the reporting. The model-graded columns only appear when a judge was
actually run, so a CI scorecard and a `--judge` scorecard are visibly different.

## Limitations & what I'd do next

- **Snippet-only sources.** The agent reasons over search snippets, not full page
  text; faithfulness is bounded by what the snippet contains. Next: fetch and
  chunk full pages.
- **Small dataset.** Three cases prove the pipeline; a real benchmark needs
  dozens across topic types.
- **No gold answers.** `keyword_coverage` is a proxy. A stronger setup would add
  a handful of expert-written reference reports and score against them.
- **Track over time.** Persist scorecards per commit to catch regressions, not
  just eyeball a single run.

---

## Interview prep — questions I should be able to answer

These are the questions a reviewer is likely to ask about this module. If I can't
answer one in my own words, I don't understand my own code well enough yet.

- **Why two layers instead of just an LLM judge?**
  Because deterministic checks are free, fast and reproducible — they run in CI.
  The judge is slow, costly and noisy, so it's for the questions regex can't
  answer.
- **What does `citation_validity` actually catch that a human might miss?**
  Hallucinated citations — an `[n]` that points to a source index that doesn't
  exist. Easy to skim past by eye, trivial to catch by parsing.
- **Why return 0.0 for a report with no citations instead of skipping it?**
  Because traceability is the job. An uncited report has failed the goal, so I
  penalise it rather than excusing it.
- **How would you add a new metric?**
  Add a pure function in `metrics.py`, surface it on `DeterministicScores`, and
  include it in `Scorecard.aggregate()`/`to_markdown()`. It needs a unit test
  with a known input/output.
- **How do you test something that calls an LLM?**
  You don't call the LLM. Inject a fake via `with_structured_output`, and inject
  a fake report `producer`. The eval logic is deterministic; only the model isn't,
  and the model is exactly the part you stub.
- **What's the biggest weakness of this eval suite?**
  No gold-standard answers, so substantive correctness leans on the LLM judge,
  which is itself imperfect. I'd add reference reports and a second judge model.
