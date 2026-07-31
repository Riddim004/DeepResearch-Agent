"""Run the eval suite from the command line: ``python -m deepresearch.evals``.

By default this runs the real agent over the built-in dataset and prints a
deterministic scorecard. Add ``--judge`` to also run the LLM-as-judge layer
(both require an API key, since they call the agent / a model).
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

from ..config import Settings
from .judge import LLMJudge
from .runner import run_evaluation


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="deepresearch.evals",
        description="Evaluate the research agent on the built-in dataset.",
    )
    parser.add_argument(
        "--judge",
        action="store_true",
        help="also run the LLM-as-judge layer (faithfulness / relevance)",
    )
    parser.add_argument("-o", "--output", help="write the scorecard to this Markdown file")
    parser.add_argument("-v", "--verbose", action="store_true", help="show progress logs")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )

    judge = None
    if args.judge:
        from ..graph import make_llm

        judge = LLMJudge(make_llm(Settings.from_env()))

    scorecard = run_evaluation(judge=judge)
    markdown = scorecard.to_markdown()
    print(markdown)

    if args.output:
        Path(args.output).write_text(markdown, encoding="utf-8")
        print(f"\nScorecard written to {args.output}")


if __name__ == "__main__":
    main()
