# 🕵️ DeepResearch Agent

[![CI](https://github.com/Riddim004/DeepResearch-Agent/actions/workflows/ci.yml/badge.svg)](https://github.com/Riddim004/DeepResearch-Agent/actions/workflows/ci.yml)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![LangGraph](https://img.shields.io/badge/built%20with-LangGraph-1c7d4d.svg)](https://langchain-ai.github.io/langgraph/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

<p align="center">
  <b>English</b> | <a href="#-中文说明">中文</a>
</p>

An autonomous, **self-correcting** research agent built on [LangGraph](https://langchain-ai.github.io/langgraph/).
Give it a topic; it plans web searches, gathers and de-duplicates sources,
drafts a **cited** Markdown report, and critiques its own draft — looping back
to gather more evidence until an internal reviewer approves it or an iteration
budget is reached. Ships with a **built-in evaluation suite** so report quality
is measured, not assumed.

> This is a hardened rewrite of an earlier prototype. The value here is not
> "an agent that calls an LLM" but a **correct, tested, observable and evaluated**
> agent loop. See [What changed & why](#-what-changed--why-the-rewrite).

## 🧠 How it works

```
          ┌─────────┐      ┌──────────┐      ┌────────┐      ┌──────────┐
  topic ─▶│ Planner │─────▶│ Searcher │─────▶│ Writer │─────▶│ Reviewer │
          └─────────┘      └──────────┘      └────────┘      └────┬─────┘
               ▲                                                  │
               │              approved / budget spent             │
               │                        ┌─────────────────────────┘
               │  revise (feedback)     ▼
               └──────────────────  ┌───────────┐      ┌───────────┐
                                    │ route      │─────▶│ Finalizer │─▶ report
                                    └───────────┘      └───────────┘
```

- **Planner** — decomposes the topic into distinct search queries. On a revision
  pass it is given the *reviewer's feedback* and the *queries already run*, so it
  digs into gaps instead of repeating itself.
- **Searcher** — runs each query on DuckDuckGo, then merges results into the
  running source set, **de-duplicating by URL and capping the total**.
- **Writer** — drafts a structured report from the numbered sources and cites
  them inline (`[1]`, `[2]`, …). On revision it edits the previous draft.
- **Reviewer** — returns a **structured** `approved: bool` + `feedback` verdict.
- **Router / Finalizer** — loops back to plan again while rejected and under the
  iteration budget; otherwise finalizes and appends a **References** section.

## ✨ Features

- 🔁 **Genuine self-correction** — reviewer feedback is actually fed back into the next planning round.
- 🧱 **Structured LLM outputs** via Pydantic (`with_structured_output`) — no fragile string parsing.
- 🔗 **Cited reports** — inline citations plus an auto-generated reference list.
- 📊 **Built-in evals** — deterministic citation/coverage/structure metrics **plus** an optional LLM-as-judge.
- 🧪 **Fully tested** — 25 tests run the whole graph *and* the eval suite with fakes, so `pytest` needs **no API key and no network**.
- 🧩 **Dependency-injected** — LLM and search backend are swappable, which is what makes the tests hermetic.
- ⚙️ **Configurable** — model, temperature, iteration budget and source caps are all environment variables.
- 🖥️ **Two frontends** — a Streamlit UI and a CLI (`python -m deepresearch`).
- 🔌 **Provider-agnostic** — OpenAI or any OpenAI-compatible endpoint (DeepSeek, local models, …).

## 🚀 Quick start

```bash
# 1. Install
pip install -r requirements.txt

# 2. Configure
cp .env.example .env      # then put your API key in .env

# 3a. Run the web UI
streamlit run app.py

# 3b. …or the CLI
python -m deepresearch "The impact of quantum computing on cryptography" -o report.md
```

## ⚙️ Configuration

All settings are read from environment variables (see [`.env.example`](.env.example)):

| Variable | Default | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | **Required.** OpenAI-compatible API key. |
| `OPENAI_API_BASE` | _unset_ | Custom base URL (e.g. DeepSeek). |
| `OPENAI_MODEL_NAME` | `gpt-4o-mini` | Chat model to use. |
| `LLM_TEMPERATURE` | `0.3` | Sampling temperature. |
| `MAX_ITERATIONS` | `2` | Max plan→review revision cycles. |
| `QUERIES_PER_PLAN` | `3` | Search queries generated per plan. |
| `RESULTS_PER_QUERY` | `4` | Results fetched per query. |
| `MAX_SOURCES` | `24` | Hard cap on accumulated sources. |

## 📊 Evaluation

An agent you cannot measure is an agent you cannot improve. The `deepresearch.evals`
package grades reports on two layers:

**Deterministic metrics** (offline, no API — these run in CI):

| Metric | What it measures |
| --- | --- |
| `citation_validity` | Fraction of inline `[n]` citations that resolve to a real source — **catches hallucinated citations**. |
| `citation_coverage` | Fraction of collected sources actually cited. |
| `structure_score` | Presence of the required report sections. |
| `keyword_coverage` | Fraction of a case's expected keywords that appear. |

**LLM-as-judge** (optional, API-backed): a model grades `faithfulness` (are the
claims grounded in the sources?) and `relevance` (does it answer the query?).

> 📄 The design rationale — why each metric exists, its tradeoffs and known
> limitations — is written up in [`docs/evals-design.md`](docs/evals-design.md).

Run the suite over the built-in dataset:

```bash
python -m deepresearch.evals              # deterministic scorecard
python -m deepresearch.evals --judge      # also run the LLM judge
python -m deepresearch.evals -o evals.md  # save the scorecard
```

Example scorecard:

```
| Case | Cite valid | Cite cover | Structure | Keywords | Refs |
|---|---|---|---|---|---|
| quantum-crypto | 1.00 | 0.83 | 1.00 | 0.75 | ✓ |
| llm-agents     | 1.00 | 0.90 | 1.00 | 1.00 | ✓ |

**Averages:** citation_validity 1.00, citation_coverage 0.87, ...
```

## 🧪 Testing

```bash
pip install -r requirements-dev.txt
pytest
```

25 tests exercise the full LangGraph workflow (happy path, the revision loop
asserting feedback reaches the planner, iteration-budget termination) **and** the
eval suite — all with injected fakes, so they are fast, deterministic and offline.
CI runs them on Python 3.10–3.12 via GitHub Actions.

## 🗂️ Project layout

```
deepresearch/
  config.py       # Settings dataclass (env-driven, testable)
  state.py        # AgentState + Source TypedDicts
  schemas.py      # Pydantic schemas for structured LLM output
  search.py       # DuckDuckGo wrapper + pure merge/dedup helper
  nodes.py        # ResearchNodes: plan / search / write / review / finalize
  graph.py        # Wires nodes into the compiled LangGraph
  __main__.py     # CLI entry point
  evals/          # Evaluation suite
    dataset.py    #   built-in eval cases
    metrics.py    #   deterministic, offline metrics
    judge.py      #   LLM-as-judge (faithfulness / relevance)
    runner.py     #   runs cases -> Scorecard
    __main__.py   #   `python -m deepresearch.evals`
app.py            # Streamlit UI
tests/            # Unit + end-to-end tests with fakes
```

## 🔧 What changed & why (the rewrite)

The original prototype looked convincing in its README but had substantive bugs.
This version fixes them:

| Area | Before | After |
| --- | --- | --- |
| **Self-correction** | Reviewer feedback was discarded; the planner re-ran with the *same* prompt, so "revision" just repeated the first plan. | Feedback and already-executed queries are threaded into the planner and writer. |
| **Cost** | The Streamlit app streamed one full run, then called `.invoke()` **a second time** just to read the result — every report cost 2× the API calls. | The graph runs **once**; the final report is read from the stream. |
| **Approval logic** | `"APPROVED" in feedback.upper()` — `"NOT APPROVED"` also passed. | Structured `approved: bool` from a Pydantic schema. |
| **Output parsing** | Queries scraped via `strip('-*1234567890. ')`. | Structured `SearchPlan` output. |
| **Sources** | Mutated shared state, no de-dup; revision loops grew context unbounded. | Pure `merge_sources`, de-duped by URL and capped. |
| **Crash** | `import os` nested inside an `if`, causing `NameError` when no key was entered. | Imports fixed; input validated. |
| **Citations** | Report had no traceable sources. | Inline `[n]` citations + auto References section. |
| **Quality measurement** | None. | Deterministic + LLM-judge eval suite. |
| **Structure** | Two flat scripts, no tests, `print` logging, deprecated `duckduckgo_search`. | Package layout, 25 tests, real `logging`, maintained `ddgs`. |

## 🛣️ Roadmap

- Fetch and chunk full page content instead of search snippets only.
- Persistent checkpoints via LangGraph's checkpointer for resumable runs.
- Track eval scores over time to catch regressions.

## 📄 License

MIT — see [LICENSE](LICENSE).

---

# 📖 中文说明

<p align="center">
  <a href="#-deepresearch-agent">English</a> | <b>中文</b>
</p>

一个基于 [LangGraph](https://langchain-ai.github.io/langgraph/) 的**自纠错**自主研究智能体。
给它一个主题，它会规划网络搜索、收集并去重信息源、撰写**带引用**的 Markdown 报告，
并对自己的草稿进行审阅——在内部审阅者通过之前（或达到迭代上限之前）不断回头补充证据。
项目自带**评估套件**，让报告质量是被**度量**出来的，而不是靠嘴说的。

> 这是对早期原型的一次彻底重构。它的价值不在于"一个会调 LLM 的智能体"，
> 而在于一个**正确、有测试、可观测、可评估**的智能体闭环。详见
> [重构改了什么、为什么改](#-重构改了什么为什么改)。

## 🧠 工作原理

```
          ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
  主题 ──▶│ 规划器 │──▶│ 搜索器 │──▶│ 撰写器 │──▶│ 审阅器 │
          └────────┘    └────────┘    └────────┘    └───┬────┘
              ▲                                          │
              │            通过 / 迭代预算耗尽            │
              │  修订(带反馈)      ┌──────────────────────┘
              └────────────  ┌────────┐    ┌────────┐
                             │ 路由    │──▶│ 定稿器 │──▶ 报告
                             └────────┘    └────────┘
```

- **规划器** — 把主题拆成多个不同的搜索查询。修订时会拿到*审阅者的反馈*和*已执行过的查询*，因此会针对缺口深挖，而不是重复自己。
- **搜索器** — 用 DuckDuckGo 执行每个查询，再把结果并入信息源集合，**按 URL 去重并封顶总量**。
- **撰写器** — 依据编号信息源撰写结构化报告，并内联引用（`[1]`、`[2]`…）。修订时基于上一版草稿修改。
- **审阅器** — 返回**结构化**的 `approved: bool` + `feedback` 判定。
- **路由 / 定稿器** — 被驳回且未超预算时回到规划；否则定稿并追加**参考文献**小节。

## ✨ 特性

- 🔁 **真正的自纠错** — 审阅反馈会被真正喂回下一轮规划。
- 🧱 **结构化 LLM 输出** — 用 Pydantic（`with_structured_output`），告别脆弱的字符串解析。
- 🔗 **带引用的报告** — 内联引用 + 自动生成的参考文献列表。
- 📊 **内置评估** — 确定性的引用/覆盖/结构指标，**外加**可选的 LLM 裁判。
- 🧪 **完整测试** — 25 个测试用假对象跑通整个图*和*评估套件，`pytest` **无需 API key、无需联网**。
- 🧩 **依赖注入** — LLM 与搜索后端可替换，这正是测试可离线运行的关键。
- ⚙️ **可配置** — 模型、温度、迭代预算、信息源上限都由环境变量控制。
- 🖥️ **双前端** — Streamlit 界面与命令行（`python -m deepresearch`）。
- 🔌 **不绑定厂商** — 支持 OpenAI 或任意 OpenAI 兼容端点（DeepSeek、本地模型等）。

## 🚀 快速开始

```bash
# 1. 安装
pip install -r requirements.txt

# 2. 配置
cp .env.example .env      # 然后在 .env 里填入你的 API key

# 3a. 运行 Web 界面
streamlit run app.py

# 3b. 或运行命令行
python -m deepresearch "量子计算对密码学的影响" -o report.md
```

## ⚙️ 配置项

所有设置读取自环境变量（见 [`.env.example`](.env.example)）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | **必填。** OpenAI 兼容的 API key。 |
| `OPENAI_API_BASE` | 未设 | 自定义 base URL（如 DeepSeek）。 |
| `OPENAI_MODEL_NAME` | `gpt-4o-mini` | 使用的对话模型。 |
| `LLM_TEMPERATURE` | `0.3` | 采样温度。 |
| `MAX_ITERATIONS` | `2` | 规划→审阅的最大修订轮数。 |
| `QUERIES_PER_PLAN` | `3` | 每次规划生成的查询数。 |
| `RESULTS_PER_QUERY` | `4` | 每个查询抓取的结果数。 |
| `MAX_SOURCES` | `24` | 累计信息源硬上限。 |

## 📊 评估

无法度量的智能体，也就无法改进。`deepresearch.evals` 从两个层面给报告打分：

**确定性指标**（离线、无需 API，可在 CI 中运行）：

| 指标 | 度量内容 |
| --- | --- |
| `citation_validity` | 内联 `[n]` 引用中能对应到真实信息源的比例——**用于抓出"引用幻觉"**。 |
| `citation_coverage` | 被真正引用到的信息源比例。 |
| `structure_score` | 报告必备小节是否齐全。 |
| `keyword_coverage` | 该用例期望关键词的命中比例。 |

**LLM 裁判**（可选、需 API）：由模型给 `faithfulness`（论断是否有信息源支撑）和 `relevance`（是否回答了问题）打分。

> 📄 各指标为什么这么设计、取舍与已知局限，详见设计文档 [`docs/evals-design.md`](docs/evals-design.md)。

在内置数据集上运行评估：

```bash
python -m deepresearch.evals              # 确定性评分卡
python -m deepresearch.evals --judge      # 同时运行 LLM 裁判
python -m deepresearch.evals -o evals.md  # 保存评分卡
```

## 🧪 测试

```bash
pip install -r requirements-dev.txt
pytest
```

25 个测试覆盖完整的 LangGraph 流程（正常路径、修订循环——并断言反馈确实传回了规划器、迭代预算终止）**以及**评估套件，全部使用注入的假对象，因此快速、确定、离线。CI 通过 GitHub Actions 在 Python 3.10–3.12 上运行。

## 🔧 重构改了什么、为什么改

原型在 README 里看着很唬人，但存在实打实的 bug，本版逐一修复：

| 方面 | 原版 | 重构后 |
| --- | --- | --- |
| **自纠错** | 审阅反馈被丢弃，规划器用*同样*的 prompt 重跑，"修订"只是重复第一次的计划。 | 反馈与已执行查询都传入规划器和撰写器。 |
| **成本** | Streamlit 先 `stream()` 跑完一遍，又 `invoke()` **再跑一遍**只为拿结果——每份报告 API 调用翻倍。 | 图只跑**一次**，结果从 stream 中读取。 |
| **审批逻辑** | `"APPROVED" in feedback.upper()`——`"NOT APPROVED"` 也被判为通过。 | Pydantic 结构化 `approved: bool`。 |
| **输出解析** | 靠 `strip('-*1234567890. ')` 硬裁查询。 | 结构化 `SearchPlan` 输出。 |
| **信息源** | 直接改共享状态、不去重；修订循环让上下文无限膨胀。 | 纯函数 `merge_sources`，按 URL 去重并封顶。 |
| **崩溃** | `import os` 嵌在 `if` 里，不填 key 直接 `NameError`。 | 修复导入并校验输入。 |
| **引用** | 报告没有可追溯的来源。 | 内联 `[n]` 引用 + 自动参考文献小节。 |
| **质量度量** | 没有。 | 确定性 + LLM 裁判评估套件。 |
| **结构** | 两个扁平脚本、无测试、`print` 日志、已废弃的 `duckduckgo_search`。 | 包化结构、25 个测试、真正的 `logging`、维护中的 `ddgs`。 |

## 🛣️ 路线图

- 抓取并切分完整网页正文，而非仅用搜索摘要。
- 借助 LangGraph 的 checkpointer 做持久化，支持断点续跑。
- 持续跟踪评估分数以捕捉回归。

## 📄 许可证

MIT，见 [LICENSE](LICENSE)。
