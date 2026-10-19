// Offline checks for createAgentStream (B1): save failures, thrown saves, agent crash, client disconnect.
import { createAgentStream, type RunRecord, type StreamDeps } from "../lib/agent/runStream";
import type { AgentEvent, AgentResult, TraceStep } from "../lib/agent/types";

const step: TraceStep = { type: "info", iteration: 1, text: "hi" };
const result: AgentResult = {
  status: "success",
  trace: [step],
  answer: { kind: "answer", answerMarkdown: "ok [1]", tables: [], sources: [], followUps: [], notes: [] },
};

async function readAll(stream: ReadableStream<Uint8Array>): Promise<AgentEvent[]> {
  const text = await new Response(stream).text();
  return text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " -> " + JSON.stringify(detail)}`);
}
const goodRun: StreamDeps["run"] = async (_q, onStep) => {
  onStep(step);
  return result;
};
const types = (e: AgentEvent[]) => e.map((x) => x.type).join(",");

async function main() {
  // 1. Normal: step, final, saved once as success
  const saved: RunRecord[] = [];
  let ev = await readAll(createAgentStream("q", { run: goodRun, save: async (r) => void saved.push(r) }));
  check("normal: step,final + 1 save", types(ev) === "step,final" && saved.length === 1 && saved[0].status === "success", { ev, saved });

  // 2. save() rejects (DB error): final still delivered
  ev = await readAll(createAgentStream("q", { run: goodRun, save: async () => { throw new Error("db down"); } }));
  check("save rejects: final still sent", types(ev) === "step,final", ev);

  // 3. save() throws synchronously (e.g. admin client env missing)
  ev = await readAll(createAgentStream("q", { run: goodRun, save: (() => { throw new Error("Missing SUPABASE_SECRET_KEY"); }) as StreamDeps["save"] }));
  check("save throws sync: final still sent", types(ev) === "step,final", ev);

  // 4. save() hangs: final delivered after the timeout
  const t0 = Date.now();
  ev = await readAll(createAgentStream("q", { run: goodRun, save: () => new Promise(() => {}), saveTimeoutMs: 50 }));
  check("save hangs: final after timeout", types(ev) === "step,final" && Date.now() - t0 < 2000, { ev, ms: Date.now() - t0 });

  // 5. Agent throws: one failed row, one error event, no final
  const failedSaves: RunRecord[] = [];
  ev = await readAll(createAgentStream("q", { run: async () => { throw new Error("boom"); }, save: async (r) => void failedSaves.push(r) }));
  check("agent throws: error + 1 failed row", types(ev) === "error" && failedSaves.length === 1 && failedSaves[0].status === "failed", { ev, failedSaves });

  // 6. Client disconnects mid-run: run finishes, saved exactly once, nothing throws
  const discSaves: RunRecord[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const stream = createAgentStream("q", {
    run: async (_q, onStep) => {
      onStep(step);
      await gate;
      onStep(step); // after cancel: must not throw
      return result;
    },
    save: async (r) => void discSaves.push(r),
  });
  const reader = stream.getReader();
  await reader.read();
  await reader.cancel();
  release();
  await new Promise((r) => setTimeout(r, 100));
  check("disconnect: saved once as success", discSaves.length === 1 && discSaves[0].status === "success", discSaves);

  process.exit(failures ? 1 : 0);
}
main();
