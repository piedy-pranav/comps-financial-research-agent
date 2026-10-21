// Reads the in-progress `answer_markdown` string out of a partially streamed final_answer tool input
// (docs: progressive answer streaming). The text is PROVISIONAL display only: it is never validated, never
// persisted and never counted; the server-resolved `final` event replaces it. Pure, no imports.

const KEY = /"answer_markdown"\s*:\s*"/;

const SIMPLE_ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

// Returns the decoded text of `answer_markdown` so far, "" if its value has started but is still empty, or null if the
// key has not appeared yet. Safe on any prefix of a JSON document: an incomplete escape (`\`, `\u12`) or a lone high
// surrogate at the very end is held back until the rest arrives, and a closing quote ends the value.
export function extractAnswerMarkdown(partialJson: string): string | null {
  const m = KEY.exec(partialJson);
  if (!m) return null;
  let out = "";
  let i = m.index + m[0].length;
  while (i < partialJson.length) {
    const c = partialJson[i];
    if (c === '"') return out; // value complete
    if (c !== "\\") {
      out += c;
      i++;
      continue;
    }
    const e = partialJson[i + 1];
    if (e === undefined) break; // dangling backslash
    if (e === "u") {
      const hex = partialJson.slice(i + 2, i + 6);
      if (hex.length < 4) break; // incomplete \uXXXX
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return out; // malformed escape: stop rather than guess
      const code = parseInt(hex, 16);
      if (code >= 0xd800 && code <= 0xdbff) {
        // High surrogate: only emit once its low half is fully present.
        const low = partialJson.slice(i + 6, i + 12);
        if (low.length < 6) break;
        const lowCode = /^\\u[0-9a-fA-F]{4}$/.test(low) ? parseInt(low.slice(2), 16) : 0;
        if (lowCode >= 0xdc00 && lowCode <= 0xdfff) {
          out += String.fromCharCode(code, lowCode);
          i += 12;
          continue;
        }
        i += 6; // unpaired surrogate: drop it
        continue;
      }
      out += String.fromCharCode(code);
      i += 6;
      continue;
    }
    const mapped = SIMPLE_ESCAPES[e];
    if (mapped === undefined) return out; // invalid escape: stop
    out += mapped;
    i += 2;
  }
  return out;
}

// Provisional text hides citation markers: they are unverified until the server resolves them, and unlinked
// markers would look like broken references.
export function stripMarkersForDraft(text: string): string {
  return text.replace(/[ \t]?\[(?:news-\d+|\d+|\d{10}-\d{2}-\d{6})\]/g, "");
}
