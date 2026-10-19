// The ReAct loop (see docs/ARCHITECTURE.md, "How the agent works").
// Each iteration the model either calls tools (Thought -> Action -> Observation) or calls
// final_answer. Capped at 6 iterations; the last one only offers final_answer so the user always
// gets what was found plus what is missing. runAgent never throws.
import Anthropic from "@anthropic-ai/sdk";
import { buildUserMessage, SYSTEM_PROMPT } from "./prompt";
import {
  ALL_TOOL_DEFINITIONS,
  createToolContext,
  executeTool,
  FINAL_ANSWER_TOOL,
  resolveFinalAnswer,
  TOOLS,
  type ToolResult,
} from "./tools";
import type { AgentResult, AnswerKind, FinalAnswer, ToolName, TraceStep } from "./types";

const MAX_ITERATIONS = 6;
const DEADLINE_MS = 90_000; // after this, the next model call may only submit final_answer
const HARD_LIMIT_MS = 115_000; // nothing may run past this (route maxDuration is 120s)
const MODEL_CALL_TIMEOUT_MS = 60_000;
const MIN_CALL_MS = 5_000;
const DEFAULT_MODEL = "claude-haiku-5-5";

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name as string, t]));
const SMALL_DATA_TOOLS = new Set<ToolName>(["lookup_ticker", "calculate"]); // others are large: summary only

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic({ timeout: 60_000, maxRetries: 2 });
  return client;
}

// Time budgets: a model call never outlives the hard limit, and tools never push a run past the
// deadline by more than a few seconds, so the final answer call always has time left.
export function modelCallTimeoutMs(elapsedMs: number): number {
  return Math.min(MODEL_CALL_TIMEOUT_MS, HARD_LIMIT_MS - elapsedMs);
}
export function toolPhaseBudgetMs(elapsedMs: number): number {
  return Math.max(3_000, DEADLINE_MS + 10_000 - elapsedMs);
}

async function withBudget(result: Promise<ToolResult>, ms: number): Promise<ToolResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const skipped = new Promise<ToolResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, error: "Skipped: the time limit for this question was reached." }),
      ms,
    );
  });
  try {
    return await Promise.race([result, skipped]);
  } finally {
    clearTimeout(timer);
  }
}

function failedResult(kind: AnswerKind, message: string, trace: TraceStep[]): AgentResult {
  const answer: FinalAnswer = {
    kind,
    answerMarkdown: message,
    tables: [],
    sources: [],
    followUps: [],
    notes: [],
  };
  return { status: "failed", answer, trace };
}

function userFacingApiError(err: unknown, cancelled: boolean): string {
  if (cancelled) return "Cancelled.";
  if (err instanceof Anthropic.RateLimitError) return "Comps is busy right now. Please try again in a minute.";
  if (err instanceof Anthropic.AuthenticationError) {
    console.error("[agent] Anthropic authentication failed. Check ANTHROPIC_API_KEY.");
    return "The agent isn't configured correctly.";
  }
  if (err instanceof Anthropic.APIError) {
    console.error("[agent] Anthropic API error:", err.status, err.message);
    return "The AI service had an error. Please try again.";
  }
  console.error("[agent] unexpected error:", err);
  return "Something went wrong. Please try again.";
}

async function callModel(
  model: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  tools: Anthropic.Beta.BetaTool[],
  timeoutMs: number,
  signal?: AbortSignal,
) {
  const isSonnet = model.startsWith("claude-sonnet-5-5");
  const response = await getClient().beta.messages.create({
    model,
    max_tokens: 8000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    cache_control: { type: "ephemeral" }, // auto-caches the growing message history
    tools,
    messages,
    output_config: { effort: "medium" },
    // Refusal fallback is Sonnet-only; Haiku has no server-side fallback.
    ...(isSonnet ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
  } as Anthropic.Beta.MessageCreateParamsNonStreaming, { timeout: timeoutMs, maxRetries: 1, signal });

  if (process.env.NODE_ENV !== "production") {
    const u = response.usage;
    console.log(
      `[agent] usage in=${u.input_tokens} out=${u.output_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0}`,
    );
  }
  return response;
}

export async function runAgent(
  question: string,
  onStep: (step: TraceStep) => void,
  signal?: AbortSignal, // aborted when the user disconnects: stop spending tokens
): Promise<AgentResult> {
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;
  const ctx = createToolContext();
  const trace: TraceStep[] = [];
  const emit = (step: TraceStep) => {
    trace.push(step);
    try {
      onStep(step);
    } catch (err) {
      // A broken listener (for example a closed stream) must not stop the run.
      console.error("[agent] onStep listener failed:", err instanceof Error ? err.message : err);
    }
  };

  const start = Date.now();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: buildUserMessage(question) },
  ];
  let nudged = false;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) return failedResult("error", "Cancelled.", trace);
    const lastStep = iteration === MAX_ITERATIONS || Date.now() - start > DEADLINE_MS;
    const tools = lastStep ? [FINAL_ANSWER_TOOL] : ALL_TOOL_DEFINITIONS;
    if (lastStep) {
      emit({
        type: "info",
        iteration,
        text: "Step limit reached. Writing the answer with what was found.",
      });
    }

    const callTimeout = modelCallTimeoutMs(Date.now() - start);
    if (callTimeout < MIN_CALL_MS) {
      return failedResult(
        "insufficient_data",
        "This took too long to finish. Try asking about fewer companies or metrics.",
        trace,
      );
    }

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await callModel(model, messages, tools, callTimeout, signal);
    } catch (err) {
      return failedResult("error", userFacingApiError(err, !!signal?.aborted), trace);
    }
    // Keep the full content (including thinking blocks) unchanged for the next request.
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") {
      return failedResult(
        "declined",
        "I can't help with that request. Comps answers questions about public companies' reported fundamentals.",
        trace,
      );
    }
    if (response.stop_reason === "max_tokens") {
      return failedResult(
        "insufficient_data",
        "The answer ran too long. Try asking about fewer companies or metrics.",
        trace,
      );
    }

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        emit({ type: "thought", iteration, text: block.text.trim() });
      }
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );

    const final = toolUses.find((t) => t.name === "final_answer");
    if (final) {
      const input = (final.input ?? {}) as Record<string, unknown>;
      if (typeof input.thought === "string" && input.thought.trim()) {
        emit({ type: "thought", iteration, text: input.thought.trim() });
      }
      const answer = resolveFinalAnswer(input, ctx, question);
      // Only real answers count as successes, so clarifications, refusals and
      // "not covered" replies never use up one of the user's questions.
      return { status: answer.kind === "answer" ? "success" : "failed", answer, trace };
    }

    if (!toolUses.length) {
      // On the last step there is no later iteration to retry in, so use the model's text as the reply.
      if (!nudged && !lastStep) {
        nudged = true;
        messages.push({
          role: "user",
          content: "Please submit your response by calling the final_answer tool.",
        });
        continue;
      }
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return failedResult(
        "insufficient_data",
        text || "I couldn't put together an answer. Please try rephrasing your question.",
        trace,
      );
    }

    // Thought + Action for every call, then run them in parallel.
    for (const t of toolUses) {
      const input = (t.input ?? {}) as { thought?: unknown };
      if (typeof input.thought === "string" && input.thought.trim()) {
        emit({ type: "thought", iteration, text: input.thought.trim() });
      }
      const def = TOOL_BY_NAME.get(t.name);
      let label = t.name;
      try {
        label = def ? def.label(t.input) : t.name;
      } catch {
        // malformed input: executeTool will report it
      }
      emit({ type: "action", iteration, id: t.id, tool: t.name as ToolName, label, input: t.input });
    }

    // Tools that outlive the budget are reported to the model as failed so the final call still has time.
    const budget = toolPhaseBudgetMs(Date.now() - start);
    const results = await Promise.all(toolUses.map((t) => withBudget(executeTool(t.name, t.input, ctx, signal), budget)));

    const toolResultBlocks: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((t, i) => {
      const r = results[i];
      emit({
        type: "observation",
        iteration,
        id: t.id,
        tool: t.name as ToolName,
        ok: r.ok,
        summary: r.ok ? r.summary : r.error,
        ...(r.ok && SMALL_DATA_TOOLS.has(t.name as ToolName) ? { data: r.data } : {}),
      });
      return {
        type: "tool_result",
        tool_use_id: t.id,
        is_error: !r.ok,
        content: r.ok ? (r.forModel ?? JSON.stringify(r.data)) : r.error,
      };
    });

    const nextIsLast = iteration + 1 === MAX_ITERATIONS || Date.now() - start > DEADLINE_MS;
    const content: Anthropic.Beta.BetaContentBlockParam[] = [...toolResultBlocks];
    if (nextIsLast) {
      content.push({
        type: "text",
        text: "This is your final step: call final_answer now with what you have, and say what is missing.",
      });
    }
    // All tool_results go in ONE user message.
    messages.push({ role: "user", content });
  }

  return failedResult(
    "insufficient_data",
    "I couldn't finish this question in the allowed steps. Try asking about fewer companies or metrics.",
    trace,
  );
}
