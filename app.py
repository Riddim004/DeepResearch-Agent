"""Streamlit UI for the DeepResearch agent.

The graph is executed exactly once: node updates are consumed from the
stream and the final report is taken from the ``finalizer`` update (the
original version streamed one run, then silently re-ran the whole agent
a second time just to read the result).
"""

import os

import streamlit as st
from dotenv import load_dotenv

from deepresearch.graph import build_graph

load_dotenv()

st.set_page_config(page_title="DeepResearch AI Agent", page_icon="🕵️", layout="wide")

st.title("🕵️ DeepResearch AI Agent")
st.markdown(
    "An autonomous research agent built with **LangGraph**: it plans web searches, "
    "gathers sources via **DuckDuckGo**, drafts a cited Markdown report and revises "
    "it based on its own reviewer's feedback."
)

with st.sidebar:
    st.header("⚙️ Configuration")
    api_key = st.text_input(
        "OpenAI-compatible API Key",
        type="password",
        placeholder="sk-...",
        help="Alternatively set OPENAI_API_KEY in a .env file.",
    )
    if api_key:
        os.environ["OPENAI_API_KEY"] = api_key
    st.markdown("---")
    st.caption("Model and iteration limits are configured via environment variables — see `.env.example`.")

query = st.text_input(
    "What would you like to research today?",
    placeholder="e.g., The impact of quantum computing on cryptography",
)

if st.button("Start Research 🚀"):
    if not os.environ.get("OPENAI_API_KEY"):
        st.error("⚠️ Please enter your API key in the sidebar or set it in a .env file.")
    elif not query.strip():
        st.warning("⚠️ Please enter a research query.")
    else:
        final_report = ""
        with st.status("Agent is working...", expanded=True) as status:
            try:
                graph = build_graph()
                for event in graph.stream({"query": query}):
                    for node, update in event.items():
                        if node == "planner":
                            st.write(f"🧠 Iteration {update.get('iteration', '?')} — search plan:")
                            for q in update.get("plan", []):
                                st.write(f"- {q}")
                        elif node == "searcher":
                            st.write(f"🔍 {len(update.get('sources', []))} unique sources collected")
                        elif node == "writer":
                            st.write("✍️ Draft written")
                        elif node == "reviewer":
                            if update.get("approved"):
                                st.write("🧐 Reviewer: ✅ approved")
                            else:
                                st.write("🧐 Reviewer: ❌ revision requested")
                                with st.expander("Reviewer feedback"):
                                    st.write(update.get("feedback", ""))
                        elif node == "finalizer":
                            final_report = update.get("final_report", "")
                status.update(label="Research complete!", state="complete", expanded=False)
            except Exception as exc:
                status.update(label="An error occurred", state="error", expanded=True)
                st.exception(exc)

        if final_report:
            st.subheader("📄 Final Research Report")
            st.markdown(final_report)
            st.download_button(
                label="Download report as Markdown",
                data=final_report,
                file_name="research_report.md",
                mime="text/markdown",
            )
