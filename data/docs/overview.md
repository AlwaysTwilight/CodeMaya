> ## Documentation Index
> Fetch the complete documentation index at: https://docs.langchain.com/llms.txt
> Use this file to discover all available pages before exploring further.

# LangGraph overview

> Gain control with LangGraph to design agents that reliably handle complex tasks

Trusted by companies shaping the future of agents-- including Klarna, Uber, J.P. Morgan, and more-- LangGraph is a low-level orchestration framework and runtime for building, managing, and deploying long-running, stateful agents.

LangGraph is very low-level, and focused entirely on agent **orchestration**. Before using LangGraph, we recommend you familiarize yourself with some of the components used to build agents, starting with [models](/oss/python/langchain/models) and [tools](/oss/python/langchain/tools).

We will commonly use [LangChain](/oss/python/langchain/overview) components throughout the documentation to integrate models and tools, but you don't need to use LangChain to use LangGraph. If you are just getting started with agents or want a higher-level abstraction, we recommend you use LangChain's [agents](/oss/python/langchain/agents) that provide prebuilt architectures for common LLM and tool-calling loops.

LangGraph is focused on the underlying capabilities important for agent orchestration: durable execution, streaming, human-in-the-loop, and more.

## <Icon icon="download" size={20} /> Install

<CodeGroup>
  ```bash pip theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  pip install -U langgraph
  ```

  ```bash uv theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  uv add langgraph
  ```
</CodeGroup>

Then, create a simple hello world example:

```python  theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph, MessagesState, START, END

def mock_llm(state: MessagesState):
    return {"messages": [{"role": "ai", "content": "hello world"}]}

graph = StateGraph(MessagesState)
graph.add_node(mock_llm)
graph.add_edge(START, "mock_llm")
graph.add_edge("mock_llm", END)
graph = graph.compile()

graph.invoke({"messages": [{"role": "user", "content": "hi!"}]})
```

<Tip>
  Use [LangSmith](/langsmith/home) to trace requests, debug agent behavior, and evaluate outputs. Set `LANGSMITH_TRACING=true` and your API key to get started.
</Tip>

## Core benefits

LangGraph provides low-level supporting infrastructure for *any* long-running, stateful workflow or agent. LangGraph does not abstract prompts or architecture, and provides the following central benefits:

* [Durable execution](/oss/python/langgraph/durable-execution): Build agents that persist through failures and can run for extended periods, resuming from where they left off.
* [Human-in-the-loop](/oss/python/langgraph/interrupts): Incorporate human oversight by inspecting and modifying agent state at any point.
* [Comprehensive memory](/oss/python/concepts/memory): Create stateful agents with both short-term working memory for ongoing reasoning and long-term memory across sessions.
* [Debugging with LangSmith](/langsmith/home): Gain deep visibility into complex agent behavior with visualization tools that trace execution paths, capture state transitions, and provide detailed runtime metrics.
* [Production-ready deployment](/langsmith/deployment): Deploy sophisticated agent systems confidently with scalable infrastructure designed to handle the unique challenges of stateful, long-running workflows.

## LangGraph ecosystem

While LangGraph can be used standalone, it also integrates seamlessly with any LangChain product, giving developers a full suite of tools for building agents. To improve your LLM application development, pair LangGraph with:

<Columns cols={1}>
  <Card title="LangSmith Observability" icon="https://mintcdn.com/langchain-5e9cc07a/nQm-sjd_MByLhgeW/images/brand/observability-icon-dark.png?fit=max&auto=format&n=nQm-sjd_MByLhgeW&q=85&s=ccbc183bca2a5e4ca78d30149e3836cc" href="/langsmith/observability" arrow cta="Learn more" width="200" height="200" data-path="images/brand/observability-icon-dark.png">
    Trace requests, evaluate outputs, and monitor deployments in one place. Prototype locally with LangGraph, then move to production with integrated observability and evaluation to build more reliable agent systems.
  </Card>

  <Card title="LangSmith Deployment" icon="https://mintcdn.com/langchain-5e9cc07a/nQm-sjd_MByLhgeW/images/brand/deployment-icon-dark.png?fit=max&auto=format&n=nQm-sjd_MByLhgeW&q=85&s=024e3712d388bfa55f4f160cc9d6a85b" href="/langsmith/deployment" arrow cta="Learn more" width="200" height="200" data-path="images/brand/deployment-icon-dark.png">
    Deploy and scale agents effortlessly with a purpose-built deployment platform for long running, stateful workflows. Discover, reuse, configure, and share agents across teams — and iterate quickly with visual prototyping in Studio.
  </Card>

  <Card title="LangChain" icon="https://mintcdn.com/langchain-5e9cc07a/nQm-sjd_MByLhgeW/images/brand/langchain-icon.png?fit=max&auto=format&n=nQm-sjd_MByLhgeW&q=85&s=663b30f85baf99ad708b97e05da2a5a4" href="/oss/python/langchain/overview" arrow cta="Learn more" width="195" height="195" data-path="images/brand/langchain-icon.png">
    Provides integrations and composable components to streamline LLM application development. Contains agent abstractions built on top of LangGraph.
  </Card>
</Columns>

## Acknowledgements

LangGraph is inspired by [Pregel](https://research.google/pubs/pub37252/) and [Apache Beam](https://beam.apache.org/). The public interface draws inspiration from [NetworkX](https://networkx.org/documentation/latest/). LangGraph is built by LangChain Inc, the creators of LangChain, but can be used without LangChain.

***

<div className="source-links">
  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/overview.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>

  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>
</div>
