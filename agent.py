import os
from typing import TypedDict, Annotated, List, Dict
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from duckduckgo_search import DDGS
from langgraph.graph import StateGraph, END

# Load environment variables
load_dotenv()

# Define State
class AgentState(TypedDict):
    query: str
    search_queries: List[str]
    search_results: List[Dict[str, str]]
    draft: str
    feedback: str
    final_report: str
    iteration: int

# Initialize LLM
def get_llm():
    # Support overriding base URL for alternative APIs like DeepSeek
    api_base = os.getenv("OPENAI_API_BASE")
    model_name = os.getenv("OPENAI_MODEL_NAME", "gpt-3.5-turbo")
    
    if api_base:
        return ChatOpenAI(model=model_name, openai_api_base=api_base, temperature=0.3)
    return ChatOpenAI(model=model_name, temperature=0.3)


# Node: Planner
def plan_search(state: AgentState):
    """Generate search queries based on the user's main query."""
    llm = get_llm()
    query = state["query"]
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert research assistant. Break down the user's research topic into 3 distinct search queries to gather comprehensive information. Return ONLY the queries separated by newlines, with no bullet points or extra text."),
        ("human", "Research topic: {topic}")
    ])
    
    chain = prompt | llm
    response = chain.invoke({"topic": query})
    queries = [q.strip().strip('-*1234567890. ') for q in response.content.split('\n') if q.strip()]
    
    return {"search_queries": queries, "iteration": state.get("iteration", 0) + 1}

# Node: Search
def execute_search(state: AgentState):
    """Execute search queries using DuckDuckGo."""
    queries = state.get("search_queries", [])
    results = state.get("search_results", [])
    
    with DDGS() as ddgs:
        for q in queries:
            try:
                # Get top 3 results per query
                search_res = list(ddgs.text(q, max_results=3))
                for r in search_res:
                    results.append({"title": r.get("title", ""), "body": r.get("body", ""), "href": r.get("href", "")})
            except Exception as e:
                print(f"Search failed for {q}: {e}")
                
    return {"search_results": results}

# Node: Writer
def write_draft(state: AgentState):
    """Write the initial research draft based on search results."""
    llm = get_llm()
    query = state["query"]
    results = state.get("search_results", [])
    
    context = "\n\n".join([f"Source ({r['href']}):\n{r['body']}" for r in results])
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a senior analyst. Write a comprehensive, well-structured research report in Markdown based on the provided context. Include an Introduction, Key Findings, and Conclusion. If the context doesn't contain enough info, state what is missing. Ensure the output is highly professional."),
        ("human", "Topic: {topic}\n\nContext:\n{context}")
    ])
    
    chain = prompt | llm
    response = chain.invoke({"topic": query, "context": context})
    
    return {"draft": response.content}

# Node: Reviewer
def review_draft(state: AgentState):
    """Review the draft and provide feedback for improvement."""
    llm = get_llm()
    query = state["query"]
    draft = state.get("draft", "")
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an editor. Review the research draft against the original topic. Provide critical feedback for improvement. If the draft is excellent and comprehensive, return 'APPROVED'."),
        ("human", "Topic: {topic}\n\nDraft:\n{draft}")
    ])
    
    chain = prompt | llm
    response = chain.invoke({"topic": query, "draft": draft})
    
    return {"feedback": response.content}

# Conditional Edge
def check_review(state: AgentState):
    """Determine if we need another iteration based on feedback."""
    feedback = state.get("feedback", "")
    iteration = state.get("iteration", 0)
    
    if "APPROVED" in feedback.upper() or iteration >= 2:
        return "finalize"
    return "revise"

# Node: Finalizer
def finalize_report(state: AgentState):
    """Final polish of the report."""
    return {"final_report": state.get("draft", "")}

# Build Graph
def build_graph():
    workflow = StateGraph(AgentState)

    workflow.add_node("planner", plan_search)
    workflow.add_node("searcher", execute_search)
    workflow.add_node("writer", write_draft)
    workflow.add_node("reviewer", review_draft)
    workflow.add_node("finalizer", finalize_report)

    workflow.set_entry_point("planner")

    workflow.add_edge("planner", "searcher")
    workflow.add_edge("searcher", "writer")
    workflow.add_edge("writer", "reviewer")
    workflow.add_conditional_edges(
        "reviewer",
        check_review,
        {
            "revise": "planner",
            "finalize": "finalizer"
        }
    )
    workflow.add_edge("finalizer", END)

    return workflow.compile()

research_agent = build_graph()

if __name__ == "__main__":
    test_query = "What are the latest advancements in AI Agents?"
    print(f"Starting research on: {test_query}")
    final_state = research_agent.invoke({"query": test_query, "iteration": 0})
    print("\n\n=== FINAL REPORT ===\n\n")
    print(final_state.get("final_report", "No report generated."))
