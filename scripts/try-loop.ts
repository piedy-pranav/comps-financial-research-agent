// Offline checks for the loop (I3, I4) with a mocked Anthropic endpoint: no API key, no cost.
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.LLM_MODEL = "claude-haiku-5-5";

import { modelCallTimeoutMs, runAgent, toolPhaseBudgetMs } from "../lib/agent/loop";

type Reply = { content: unknown[]; stop_reason: string };
let calls: { tools: string[] }[] = [];
let script: Reply[] = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (!String(input).includes("/v1/messages")) throw new Error(`unexpected fetch ${String(input)}`);
  const body = JSON.parse(String(init?.body));
  calls.push({ tools: (body.tools ?? []).map((t: { name: string }) => t.name) });
  const reply = script[Math.min(calls.length - 1, script.length - 1)];
  return new Response(
    JSON.stringify({
      id: "msg_x", type: "message", role: "assistant", model: "m", stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 }, ...reply,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}) as typeof fetch;

const toolUse = (id: string): Reply => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id, name: "calculate", input: { thought: "t", calculations: [{ label: "x", expression: "1+1" }] } }],
});

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " -> " + JSON.stringify(detail)}`);
}

async function main() {
  // I4: model keeps calling tools, then answers in plain text on the last step: its text must be kept.
  calls = [];
  script = [1, 2, 3, 4, 5].map((i) => toolUse(`tu_${i}`));
  script.push({ stop_reason: "end_turn", content: [{ type: "text", text: "Here is what I found so far: partial data." }] });
  let r = await runAgent("q", () => {});
  check("last step: 6 model calls", calls.length === 6, calls.length);
  check("last step: only final_answer offered", calls[5].tools.join() === "final_answer", calls[5].tools);
  check("last step: model text kept (not generic message)", r.status === "failed" && r.answer.answerMarkdown.includes("partial data"), r.answer);

  // Normal early text-only reply still gets one nudge
  calls = [];
  script = [
    { stop_reason: "end_turn", content: [{ type: "text", text: "thinking out loud" }] },
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "f1", name: "final_answer", input: { thought: "t", kind: "off_topic", answer_markdown: "I do fundamentals.", tables: [], citations: [], follow_ups: [], notes: [] } }] },
  ];
  r = await runAgent("poem", () => {});
  check("early text-only: nudged, then off_topic", calls.length === 2 && r.answer.kind === "off_topic" && r.status === "failed", { calls: calls.length, r });

  // final_answer straight away
  calls = [];
  script = [script[1]];
  r = await runAgent("poem", () => {});
  check("direct final_answer: 1 call", calls.length === 1 && r.answer.kind === "off_topic", calls.length);

  // A throwing step listener must not break the run
  calls = [];
  r = await runAgent("poem", () => { throw new Error("listener boom"); });
  check("throwing onStep does not stop the run", r.answer.kind === "off_topic", r);

  // I3: time budgets
  check("model call timeout is 60s early", modelCallTimeoutMs(0) === 60_000, modelCallTimeoutMs(0));
  check("model call timeout shrinks near the hard limit", modelCallTimeoutMs(100_000) === 15_000, modelCallTimeoutMs(100_000));
  check("model call timeout < 5s late (loop gives up)", modelCallTimeoutMs(112_000) < 5_000, modelCallTimeoutMs(112_000));
  check("tool budget ~100s at start", toolPhaseBudgetMs(0) === 100_000, toolPhaseBudgetMs(0));
  check("tool budget ends 10s past the deadline", toolPhaseBudgetMs(95_000) === 5_000, toolPhaseBudgetMs(95_000));
  check("tool budget has a 3s floor", toolPhaseBudgetMs(200_000) === 3_000, toolPhaseBudgetMs(200_000));

  process.exit(failures ? 1 : 0);
}
main();
