// Server-render check of the clarification UI (no browser): option buttons, the text box, no table/source chrome.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentTrace } from "../components/agent-trace";
import { AnswerView } from "../components/answer-view";
import type { AgentResult } from "../lib/agent/types";

const result: AgentResult = {
  status: "failed",
  trace: [],
  answer: {
    kind: "clarification",
    answerMarkdown: '"Delta" could be more than one company that files with the SEC. Which one do you mean?',
    tables: [{ title: "should be hidden", columns: ["a"], rows: [["1"]] }],
    sources: [],
    followUps: [],
    notes: [],
    clarification: {
      query: "Delta",
      question: "How is Delta doing?",
      options: [
        { name: "DELTA AIR LINES, INC.", ticker: "DAL", question: "How is DAL doing?" },
        { name: "DeltaSoft Corp", ticker: "DSFT", question: "How is DSFT doing?" },
      ],
    },
  },
};

let failures = 0;
function check(name: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}

const html = renderToStaticMarkup(createElement(AnswerView, { result, onAsk: () => {} }));
check("shows the question text", html.includes("could be more than one company"));
check("button for each option", html.includes("DELTA AIR LINES, INC. (DAL)") && html.includes("DeltaSoft Corp (DSFT)"));
check("exactly 2 option buttons + the Ask submit", (html.match(/<button/g) ?? []).length === 3);
check("text box for the exact name", html.includes('placeholder="Or type the exact company name or ticker"'));
check("Ask button disabled until something is typed", /<button[^>]*disabled[^>]*>Ask<\/button>/.test(html));
check("no table or investment-advice footer on a non-answer", !html.includes("should be hidden") && !html.includes("Not investment advice"));

const plain = renderToStaticMarkup(createElement(AnswerView, { result: { ...result, answer: { ...result.answer, clarification: undefined } }, onAsk: () => {} }));
check("clarification without options data: no buttons or text box", !plain.includes("<input") && !plain.includes("<button"));
// N8: the trace counts rounds of the loop, not individual tool calls
const act = (iteration: number, id: string) => ({ type: "action" as const, iteration, id, tool: "lookup_ticker" as const, label: "x", input: {} });
const trace = renderToStaticMarkup(createElement(AgentTrace, { steps: [act(1, "a"), act(1, "b"), act(1, "c"), act(2, "d")], loading: false }));
check("3 parallel calls + 1 later call = 2 steps", trace.includes("Researched in 2 steps"));

process.exit(failures ? 1 : 0);
