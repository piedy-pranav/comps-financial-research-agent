// Offline render smoke of the V2 integrity UI (research panel and /audit result), with V2 and pre-V2 objects.
// Run: npx tsx scripts/try-integrity-render.tsx   (no react-server condition: these are client components)
import { renderToStaticMarkup } from "react-dom/server";
import { AuditResult } from "../components/audit/audit-workspace";
import { ComparabilityCautions } from "../components/research/comparability-cautions";
import { buildAudit, type CompanyData, type FactRow } from "../lib/audit/engine";
import { summarize, type ResearchAuditPlan } from "../lib/audit/research";
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
check("P1 V2 panel heading", panel.includes("Financial comparison integrity"));
check("P1 BLOCKED safeguard names the withheld metrics", panel.includes("Do not rely on") && panel.includes("Operating income, Operating margin"), panel);
check("P1 READY revenue shown with INFO timing, not a caution", panel.includes("Ready") && panel.includes(">Info<"));
check("P1 states the answer is not edited by the review", panel.includes("written before this review"));
check("P1 coverage disclosure for unassessed checks", panel.includes("accounting-policy and footnote equivalence, revisions and restatements"));
check("P1 source basis shown", panel.includes("Source basis: NKE reported · UAA reported"));

const legacySummary = toResearchAudit({ status: "partial", auditedPeriod: "FY2024", companies: ["NKE", "UAA"], periodDetails: [], checkedMetrics: ["Revenue"], uncheckedMetrics: [], limitations: [], findings: [{ pair: "NKE vs UAA", metricId: "revenue", metric: "Revenue", status: "PARTIALLY_COMPARABLE", explanation: "Fiscal years end 61 days apart.", evidenceUrls: ["https://www.sec.gov/x"] }] })!;
const legacyPanel = renderToStaticMarkup(<ComparabilityCautions audit={legacySummary} />);
check("P2 saved pre-V2 summary renders the earlier view", legacyPanel.includes("Comparability cautions") && legacyPanel.includes("Partially comparable") && !legacyPanel.includes("Readiness") && !legacyPanel.includes("Do not rely"));

const result = renderToStaticMarkup(<AuditResult audit={audit} />);
check("P3 /audit shows decision readiness verdict", result.includes("Decision readiness") && result.includes("blocked (operating income, operating margin)"));
check("P3 conclusion withheld on blocked metric", result.includes("Conclusion withheld."));
check("P3 not-assessed checks rendered without a check mark label", result.includes("Not assessed") && result.includes("Coverage limits"));
check("P3 period window and concept shown", result.includes("2025-06-01 to 2026-05-31") && result.includes("us-gaap:Revenues"));

const legacy = JSON.parse(JSON.stringify(audit)) as ComparabilityAudit;
delete legacy.integrity;
for (const m of legacy.metrics) delete m.integrity;
const legacyResult = renderToStaticMarkup(<AuditResult audit={legacy} />);
check("P4 pre-V2 audit object renders with legacy checks", legacyResult.includes("Metric review") && !legacyResult.includes("Decision readiness") && legacyResult.includes("currency:"));

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
if (failures) process.exit(1);
