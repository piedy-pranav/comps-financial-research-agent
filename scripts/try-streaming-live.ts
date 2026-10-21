// Live check of progressive answer streaming with the real API (costs a few cents per model).
// Usage: LLM_MODEL=claude-sonnet-5-5 NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/try-streaming-live.ts
import { runAgent } from "../lib/agent/loop";
import { stripMarkersForDraft } from "../lib/agent/partialJson";

async function main() {
  const q = process.argv[2] ?? "How have Nike's revenue and gross margin changed over the last 3 fiscal years?";
  console.log(`MODEL ${process.env.LLM_MODEL ?? "(default)"}\nQ: ${q}`);
  const t0 = Date.now();
  const deltas: { t: number; len: number; text: string }[] = [];
  let finalAt = 0;
  const warn = console.warn;
  let fellBack = false;
  console.warn = (...a) => { if (String(a[0]).includes("streaming call failed")) fellBack = true; warn(...a); };
  const r = await runAgent(q, () => {}, undefined, "", (text) => deltas.push({ t: Date.now() - t0, len: text.length, text }));
  finalAt = Date.now() - t0;
  const finalText = stripMarkersForDraft(r.answer.answerMarkdown);
  const last = stripMarkersForDraft(deltas[deltas.length - 1]?.text ?? "");
  console.log(`status=${r.status} kind=${r.answer.kind} total=${(finalAt / 1000).toFixed(1)}s fellBack=${fellBack}`);
  console.log(`previews=${deltas.length} first@${((deltas[0]?.t ?? 0) / 1000).toFixed(1)}s last@${((deltas[deltas.length - 1]?.t ?? 0) / 1000).toFixed(1)}s final@${(finalAt / 1000).toFixed(1)}s`);
  console.log(`draft growth: ${deltas.slice(0, 8).map((d) => d.len).join(", ")} ...`);
  const mono = deltas.every((d, i) => i === 0 || d.len >= deltas[i - 1].len);
  console.log(`monotonic=${mono}  lastDraftEqualsFinal(after marker strip)=${last.trim() === finalText.trim()}`);
  console.log(`final sources=${r.answer.sources.length} tables=${r.answer.tables.length} followUps=${r.answer.followUps.length}`);
  process.exit(!fellBack && deltas.length >= 3 && mono ? 0 : 1);
}
main();
