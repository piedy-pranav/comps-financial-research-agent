// Offline render smoke of the V2 integrity UI (research panel and /audit result), with V2 and pre-V2 objects.
// Run: npx tsx scripts/try-integrity-render.tsx   (no react-server condition: these are client components)
import { renderToStaticMarkup } from "react-dom/server";
import { AuditResult } from "../components/audit/audit-workspace";
import { ComparabilityCautions } from "../components/research/comparability-cautions";
import { applyEvent, newTurn, turnView, updateTurn } from "../components/research/conversation";
import { TurnResult } from "../components/research/turn-result";
import type { AgentResult } from "../lib/agent/types";
import { READINESS_EXPLANATION, READINESS_LABEL } from "../lib/audit/report";
import { buildAudit, type CompanyData, type FactRow } from "../lib/audit/engine";
import { planResearchAudit, summarize, type ResearchAuditPlan } from "../lib/audit/research";
import { parsePersistedRun } from "../lib/history-parse";
import { toResearchAudit, type ComparabilityAudit } from "../lib/audit/types";

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${String(detail).slice(0, 500)}`}`);
}

const row = (fy: number, start: string, end: string, value: number, acc: string, tag: string): FactRow => ({ fiscalYear: fy, periodStart: start, periodEnd: end, value, form: "10-K", filed: "2026-06-01", tag, citationKey: acc });
function co(ticker: string, start: string, end: string, oi: boolean): CompanyData {
  const acc = `${ticker}-ACC`;
  return {
    company: { ticker, name: `${ticker} Inc.`, cik: 1 },
    metrics: {
      revenue: [row(2026, start, end, 5e9, acc, "Revenues")],
      operating_income: oi ? [row(2026, start, end, 5e8, acc, "OperatingIncomeLoss")] : [],
      net_income: [row(2026, start, end, 3e8, acc, "NetIncomeLoss")],
    },
    nonUsdUnits: {},
    filings: { [acc]: { url: `https://www.sec.gov/Archives/${ticker}`, form: "10-K", filed: "2026-06-01" } },
  };
}
const audit = buildAudit(co("NKE", "2025-06-01", "2026-05-31", false), co("UAA", "2025-04-01", "2026-03-31", true), 2026, { auditId: "r", now: new Date("2026-10-21T00:00:00Z") });
const plan: ResearchAuditPlan = { tickers: ["NKE", "UAA"], metrics: ["revenue", "operating_income", "operating_margin", "net_income"], uncheckedMetrics: ["Growth rates"], period: 2026, multiYear: false, yearsInResearch: [2026] };
const summary = summarize(plan, [audit]);

const panel = renderToStaticMarkup(<ComparabilityCautions audit={summary} />);
check("P1 V2 panel title and explanatory subtitle", panel.includes("Financial Comparison Integrity") && panel.includes("Checks whether financial figures are suitable for comparison based on reporting periods, source data, accounting concepts, and calculation consistency."));
check(
  "P1 summary: comparison not supported for OI and margin, with the missing evidence named",
  panel.includes("Comparison not supported:</span> Operating income, Operating margin") && panel.includes("Operating income: NKE: no us-gaap OperatingIncomeLoss fact in SEC Company Facts for any year retrieved.") && panel.includes("Operating margin: NKE: no us-gaap OperatingIncomeLoss"),
  panel,
);
check("P1 summary: revenue and net income reliable to compare", panel.includes("Reliable to compare:</span> Revenue, Net income, for the audited year."), panel);
check("P1 READY revenue shown with INFO timing, not a caution", panel.includes(">Reliable to compare<") && panel.includes(">Info<"));
check("P1 old wording gone", !/Do not rely|>Ready<|>Blocked<|>Review</.test(panel));
check("P1 states the answer is not edited by the review", panel.includes("answer above was written before this review"));
check("P1 legend explains the states shown, with tooltips on badges", panel.includes(READINESS_EXPLANATION.READY) && panel.includes(READINESS_EXPLANATION.BLOCKED) && !panel.includes(READINESS_EXPLANATION.REVIEW.slice(0, 40) + "</dd>") && panel.includes(`title="${READINESS_EXPLANATION.BLOCKED}"`));
check("P1 accounting-policy limit kept", panel.includes("not that the companies") && panel.includes("accounting-policy and footnote equivalence"));
check("P1 coverage disclosure for unassessed checks", panel.includes("Not assessed for any metric: accounting-policy and footnote equivalence."));
check("P1 source basis shown", panel.includes("Source basis: NKE reported · UAA reported"));

const legacySummary = toResearchAudit({ status: "partial", auditedPeriod: "FY2024", companies: ["NKE", "UAA"], periodDetails: [], checkedMetrics: ["Revenue"], uncheckedMetrics: [], limitations: [], findings: [{ pair: "NKE vs UAA", metricId: "revenue", metric: "Revenue", status: "PARTIALLY_COMPARABLE", explanation: "Fiscal years end 61 days apart.", evidenceUrls: ["https://www.sec.gov/x"] }] })!;
const legacyPanel = renderToStaticMarkup(<ComparabilityCautions audit={legacySummary} />);
check("P2 saved pre-V2 summary renders the earlier view", legacyPanel.includes("Comparability cautions") && legacyPanel.includes("Partially comparable") && !legacyPanel.includes("Readiness") && !legacyPanel.includes("Do not rely"));

const result = renderToStaticMarkup(<AuditResult audit={audit} />);
check("P3 /audit shows the integrity title, subtitle and labeled verdict", result.includes("Financial Comparison Integrity") && result.includes("calculation consistency") && result.includes("Insufficient evidence: operating income, operating margin."), result.slice(0, 300));
check("P3 blocked metric: comparison not supported, with the state explanation", result.includes("Comparison not supported.") && result.includes(READINESS_EXPLANATION.BLOCKED));
check("P3 old wording gone from /audit", !/Decision readiness|Conclusion withheld|>Ready<|>Blocked</.test(result));
check("P3 not-assessed checks rendered without a check mark label", result.includes("Not assessed") && result.includes("Coverage limits"));
check("P3 period window and concept shown", result.includes("2025-06-01 to 2026-05-31") && result.includes("us-gaap:Revenues"));

const legacy = JSON.parse(JSON.stringify(audit)) as ComparabilityAudit;
delete legacy.integrity;
for (const m of legacy.metrics) delete m.integrity;
const legacyResult = renderToStaticMarkup(<AuditResult audit={legacy} />);
check("P4 pre-V2 audit object renders with legacy checks", legacyResult.includes("Metric review") && !legacyResult.includes("Financial Comparison Integrity") && legacyResult.includes("currency:"));

// All three states with labels and explanations, mixed in one panel.
{
  const lulu = buildAudit(co("NKE", "2023-06-01", "2024-05-31", true), co("LULU", "2023-01-30", "2024-01-28", true), 2026, { auditId: "m", now: new Date("2026-10-21T00:00:00Z") });
  const mixed = summarize({ ...plan, tickers: ["NKE", "LULU"] }, [lulu, audit]);
  const html = renderToStaticMarkup(<ComparabilityCautions audit={mixed} />);
  const states = new Set(mixed.findings.map((f) => f.readiness));
  check("P5 mixed fixture has all three internal states", states.size === 3, [...states]);
  for (const r of ["READY", "REVIEW", "BLOCKED"] as const) {
    check(`P5 ${r} -> "${READINESS_LABEL[r]}" with its explanation`, html.includes(`>${READINESS_LABEL[r]}<`) && html.includes(READINESS_EXPLANATION[r]));
  }
  check("P5 caution summary line present", html.includes("Compare with caution:</span>"));
}

// Order and ownership: the complete answer first, its own review after it, once.
const answerResult: AgentResult = {
  status: "success",
  trace: [],
  answer: {
    kind: "answer",
    answerMarkdown: "Nike is larger by revenue [1].",
    tables: [{ title: "Revenue table", columns: ["Fiscal year", "NKE", "UAA"], rows: [["FY2026", "$46.40B [1]", "$4.97B [1]"]] }],
    sources: [{ n: 1, type: "filing", company: "NIKE", ticker: "NKE", form: "10-K", fiscalYear: 2026, periodEnd: "2026-05-31", filed: "2026-07-20", accession: "A", url: "https://www.sec.gov/a" }],
    followUps: ["What about margins?"],
    notes: [],
  },
};
const order = (html: string, ...needles: string[]) => needles.map((n) => html.indexOf(n));
const asc = (xs: number[]) => xs.every((x, i) => x >= 0 && (i === 0 || x > xs[i - 1]));
{
  const html = renderToStaticMarkup(<TurnResult result={answerResult} audit={summary} onAsk={() => {}} />);
  const pos = order(html, "Nike is larger by revenue", "Revenue table", "https://www.sec.gov/a", "What about margins?", "Financial Comparison Integrity");
  check("O1 prose, table, citations and follow-ups all render before the integrity panel", asc(pos), pos);
  check("O1 exactly one panel", html.split('aria-label="Financial comparison integrity"').length - 1 === 1);
  const none = renderToStaticMarkup(<TurnResult result={answerResult} audit={null} />);
  check("O2 no audit -> answer only, no panel", none.includes("Revenue table") && !none.includes("Comparison Integrity") && !none.includes("Comparability"));
  const unavailable = renderToStaticMarkup(<TurnResult result={answerResult} audit={{ ...summary, status: "unavailable", findings: [] }} />);
  const up = order(unavailable, "Revenue table", "review unavailable");
  check("O3 unavailable review still below the answer", asc(up), up);
}

// Live turn: the panel shows only once the validated answer is visible, and stays with its own turn.
{
  let a = newTurn("a", "Compare NKE and UAA");
  a = applyEvent(a, { type: "answer_delta", text: "Nike is" });
  check("O4 while streaming the draft, no result is visible (panel gated on the result)", !turnView(a).resultVisible);
  a = applyEvent(a, { type: "audit", audit: summary });
  check("O4 audit arriving early is held, not shown, until the result is visible", a.audit !== null && !turnView(a).resultVisible);
  a = applyEvent(a, { type: "final", result: answerResult });
  a = { ...a, draftDone: true };
  check("O4 after final and drain, result visible with its audit", turnView(a).resultVisible && JSON.stringify(a.audit) === JSON.stringify(summary));

  let turns = [a, newTurn("b", "And Lululemon?")];
  turns = updateTurn(turns, "b", (t) => applyEvent(applyEvent(t, { type: "final", result: answerResult }), { type: "audit", audit: { ...summary, auditedPeriod: "FY2025" } }));
  const htmlA = renderToStaticMarkup(<TurnResult result={turns[0].result!} audit={turns[0].audit} />);
  const htmlB = renderToStaticMarkup(<TurnResult result={turns[1].result!} audit={turns[1].audit} />);
  check("O5 follow-up's audit attaches to its own turn; the earlier panel is unchanged", JSON.stringify(turns[0].audit) === JSON.stringify(a.audit) && turns[0] === a && htmlA.includes("Audited period: FY2026") && htmlB.includes("Audited period: FY2025") && !htmlA.includes("FY2025<"));
}

// Reload / history: a saved run restores the same answer-then-panel order.
{
  const restored = parsePersistedRun({ steps: [], answer: answerResult.answer, audit: JSON.parse(JSON.stringify(summary)) }, "x", "success");
  const html = renderToStaticMarkup(<TurnResult result={{ status: "success", answer: restored.answer!, trace: restored.steps }} audit={restored.audit} />);
  const pos = order(html, "Revenue table", "Financial Comparison Integrity", "Insufficient evidence");
  check("O6 reloaded run: answer then panel, readiness labels restored", restored.audit?.findings[0].readiness === "READY" && asc(pos), pos);
  const old = parsePersistedRun({ steps: [], answer: answerResult.answer }, "x", "success");
  check("O6 older saved run without an audit shows no panel", !renderToStaticMarkup(<TurnResult result={{ status: "success", answer: old.answer!, trace: [] }} audit={old.audit} />).includes("Comparab"));
}

// Ineligible research never gets a review to show.
{
  const single: AgentResult = { ...answerResult, trace: [{ type: "action", iteration: 1, id: "t1", tool: "get_financials", label: "", input: { thought: "", ticker: "NKE", metrics: ["revenue"], years: 5 } }, { type: "observation", iteration: 1, id: "t1", tool: "get_financials", ok: true, summary: "" }] };
  check("O7 single-company research is not audited (no panel)", planResearchAudit(single) === null);
}

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
if (failures) process.exit(1);
