"""Command-line entry point: ``python -m deepresearch "your topic"``."""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

from .graph import build_graph


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="deepresearch",
        description="Research a topic on the web and produce a cited Markdown report.",
    )
    parser.add_argument("topic", help="research topic, e.g. 'RISC-V adoption in 2026'")
    parser.add_argument("-o", "--output", help="write the report to this Markdown file")
    parser.add_argument("-v", "--verbose", action="store_true", help="show progress logs")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )

    graph = build_graph()
    final_state = graph.invoke({"query": args.topic})
    report = final_state.get("final_report", "")

    if args.output:
        Path(args.output).write_text(report, encoding="utf-8")
        print(f"Report written to {args.output}")
    else:
        print(report)


if __name__ == "__main__":
    main()
