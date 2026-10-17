// STUB. Owner: Step 2 (Pranav).
// The ReAct loop (see docs/ARCHITECTURE.md, "How the agent works").
// Should: send the question + system prompt (./prompt.ts) + tool definitions (./tools/)
// to the model named in LLM_MODEL; each turn either run the chosen tool and feed its
// result back as the Observation, or return the final answer. Stop at 6 iterations,
// retry a failed tool once, and emit each Thought/Action/Observation step so
// /api/agent can stream the trace. Return { answer, trace, status }.

export {};
