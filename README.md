# 🕵️ DeepResearch AI Agent

[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.0.38-green)](https://python.langchain.com/docs/langgraph)
[![Streamlit](https://img.shields.io/badge/Streamlit-1.33.0-FF4B4B.svg)](https://streamlit.io/)

An autonomous AI Research Agent powered by **LangGraph**, **LangChain**, and **OpenAI/DeepSeek API**. This agent takes a user's research topic, autonomously plans a search strategy, executes web searches, synthesizes the information into a comprehensive report, and self-reviews the draft for quality assurance.

This project was built to demonstrate advanced Agentic workflows commonly required in top-tier AI/LLM engineering roles.

## ✨ Features

- **Multi-Node Agentic Workflow**: Built with `LangGraph` to manage complex, cyclic states.
- **Autonomous Planning**: Breaks down a macro research topic into targeted search queries.
- **Tool Integration**: Uses `DuckDuckGo` API for real-time web search capabilities.
- **Self-Reflection & Self-Correction**: Includes a "Reviewer" node that evaluates the drafted report against the original prompt. If the report lacks depth, the graph cycles back to gather more information.
- **Modern UI**: Clean and interactive frontend built with `Streamlit`, visualizing the agent's thought process step-by-step.

## 🧠 Architecture (LangGraph State Machine)

The Agent operates through the following nodes:
1. **Planner**: Analyzes the query and generates 3 specific search strategies.
2. **Searcher**: Executes searches and aggregates context.
3. **Writer**: Drafts a markdown report based on the aggregated context.
4. **Reviewer**: Evaluates the draft. If it meets quality standards, it moves to `Finalizer`. If not, it routes back to `Planner` for a deeper dive.

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/Riddim004/DeepResearch-Agent.git
cd DeepResearch-Agent
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Setup Environment Variables
Create a `.env` file in the root directory and add your API keys:
```env
OPENAI_API_KEY=sk-your-api-key-here
# Optional: Use DeepSeek or other OpenAI compatible endpoints
# OPENAI_API_BASE=https://api.deepseek.com/v1
# OPENAI_MODEL_NAME=deepseek-chat
```

### 4. Run the Application
```bash
streamlit run app.py
```

## 🛠️ Tech Stack

- **Core Logic**: Python, LangChain, LangGraph
- **LLM Provider**: OpenAI API (Configurable to DeepSeek/others)
- **Tools**: DuckDuckGo Search
- **Frontend**: Streamlit
- **Data Validation**: Pydantic

## 🎯 Use Cases

- Academic Research Summarization
- Market Analysis
- Competitive Intelligence gathering
- Technology Trend monitoring

---
*Developed to showcase proficiency in LLM Application Development, Agentic Frameworks, and Prompt Engineering.*
