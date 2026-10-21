// Offline: the partial final_answer JSON extractor (lib/agent/partialJson.ts). Run: npx tsx scripts/try-partial-json.ts
import { extractAnswerMarkdown, stripMarkersForDraft } from "../lib/agent/partialJson";

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " -> " + JSON.stringify(detail)}`);
}

const text = 'Nike "gross" margin\nrose to 44.6% [1] \\ path/é — 😀 and <b>tag</b>\tend. {"answer_markdown":"fake"}';
const doc = JSON.stringify({ thought: 'said "answer_markdown": "x"', kind: "answer", answer_markdown: text, tables: [], citations: [{ n: 1, key: "k" }] });
const full = extractAnswerMarkdown(doc);
check("full document decodes exactly", full === text, full);

// Every prefix: result is null, or a prefix of the final text (never garbage), and grows monotonically.
let prev = "";
let bad: unknown = null;
let sawNull = false;
for (let i = 0; i <= doc.length; i++) {
  const r = extractAnswerMarkdown(doc.slice(0, i));
  if (r === null) { sawNull = true; if (prev) bad = { i, r, prev }; continue; }
  if (!text.startsWith(r)) bad = { i, r };
  if (r.length < prev.length) bad = { i, shrank: [prev, r] };
  prev = r;
}
check("every prefix is null or a monotonic prefix of the final text", bad === null && sawNull, bad);

// Unicode escapes (ASCII-escaped JSON as some serializers emit), incl. surrogate pair split mid-escape.
const esc = '{"kind":"answer","answer_markdown":"caf\\u00e9 \\ud83d\\ude00 ok"}';
check("\\u escapes decode", extractAnswerMarkdown(esc) === "café 😀 ok", extractAnswerMarkdown(esc));
const cut = (n: number) => extractAnswerMarkdown(esc.slice(0, esc.indexOf("\\ud83d") + n));
check("incomplete \\u held back", cut(3) === "café " && cut(5) === "café ", [cut(3), cut(5)]);
check("lone high surrogate held until pair completes", cut(6) === "café " && cut(10) === "café " && cut(11) === "café ", [cut(6), cut(10)]);
check("surrogate pair emitted whole", cut(12) === "café 😀", cut(12));
check("dangling backslash held back", extractAnswerMarkdown('{"answer_markdown":"a\\') === "a");
check("escaped quote not treated as the end", extractAnswerMarkdown('{"answer_markdown":"say \\"hi') === 'say "hi');
check("closing quote ends the value", extractAnswerMarkdown('{"answer_markdown":"done","tables":["x"') === "done");
check("value not started yet -> empty string", extractAnswerMarkdown('{"kind":"answer","answer_markdown":"') === "");
check("key not present -> null", extractAnswerMarkdown('{"thought":"hel') === null && extractAnswerMarkdown("") === null);
check("key name inside another string is ignored", extractAnswerMarkdown('{"thought":"the \\"answer_markdown\\": \\"x\\"","kind":"a') === null);
check("invalid escape stops safely", extractAnswerMarkdown('{"answer_markdown":"ab\\qcd"}') === "ab");
check("malformed \\u stops safely", extractAnswerMarkdown('{"answer_markdown":"ab\\uZZZZcd"}') === "ab");
check("whitespace around colon ok", extractAnswerMarkdown('{"answer_markdown" :  "hi') === "hi");

check("markers hidden in drafts", stripMarkersForDraft("Margin 44.6% [1] and 55% [news-2], also [0000320187-24-000039]. Keep [text].") === "Margin 44.6% and 55%, also. Keep [text].", stripMarkersForDraft("Margin 44.6% [1] and 55% [news-2], also [0000320187-24-000039]. Keep [text]."));

console.log(failures ? `\n${failures} FAILED` : "\nAll partial JSON checks passed");
process.exit(failures ? 1 : 0);
