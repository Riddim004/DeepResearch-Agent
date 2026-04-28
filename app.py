import streamlit as st
from agent import research_agent

st.set_page_config(page_title="DeepResearch AI Agent", page_icon="🕵️", layout="wide")

st.title("🕵️ DeepResearch AI Agent")
st.markdown("""
This application uses **LangGraph** to autonomously research any topic. 
It plans a search strategy, uses **DuckDuckGo** to browse the web, and synthesizes the findings into a comprehensive markdown report.
""")

# Sidebar configuration
with st.sidebar:
    st.header("⚙️ Configuration")
    api_key = st.text_input("OpenAI API Key", type="password", placeholder="sk-...")
    if api_key:
        import os
        os.environ["OPENAI_API_KEY"] = api_key
    st.markdown("---")
    st.markdown("Built for **AI Agent Internship Portfolios**.")
    st.markdown("Powered by LangGraph & GPT-3.5/GPT-4.")

query = st.text_input("What would you like to research today?", placeholder="e.g., The impact of quantum computing on cryptography in 2024")

if st.button("Start Research 🚀"):
    if not os.environ.get("OPENAI_API_KEY") and not api_key:
        st.error("⚠️ Please enter your OpenAI API Key in the sidebar or set it in the .env file.")
    elif not query:
        st.warning("⚠️ Please enter a research query.")
    else:
        with st.status("Agent is working...", expanded=True) as status:
            try:
                st.write("🧠 Planning search strategy...")
                # Stream the events from langgraph
                for event in research_agent.stream({"query": query, "iteration": 0}):
                    if "planner" in event:
                        st.write("✅ Plan created. Generated search queries:")
                        for q in event["planner"].get("search_queries", []):
                            st.write(f"- {q}")
                    elif "searcher" in event:
                        st.write("🔍 Executing web searches and reading articles...")
                    elif "writer" in event:
                        st.write("✍️ Synthesizing information and drafting report...")
                    elif "reviewer" in event:
                        st.write("🧐 Reviewing draft against original requirements...")
                        feedback = event["reviewer"].get("feedback", "")
                        with st.expander("Reviewer Feedback"):
                            st.write(feedback)
                        if "APPROVED" not in feedback.upper() and event["reviewer"].get("iteration", 0) < 2:
                            st.write("🔄 Feedback received. Refining research...")
                
                status.update(label="Research Complete!", state="complete", expanded=False)
                
                # Fetch the final state
                final_state = research_agent.invoke({"query": query, "iteration": 0})
                
                st.subheader("📄 Final Research Report")
                st.markdown(final_state.get("final_report", "No report generated."))
                
                st.download_button(
                    label="Download Report as Markdown",
                    data=final_state.get("final_report", ""),
                    file_name="research_report.md",
                    mime="text/markdown"
                )
            except Exception as e:
                status.update(label="An error occurred", state="error", expanded=True)
                st.error(f"Error details: {str(e)}")
