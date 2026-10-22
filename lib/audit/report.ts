// Markdown export of an audit. Pure; used in the browser for the download button.
import type { CheckStatus, ComparabilityAudit, ComparabilityStatus, Readiness, SourceBasis } from "./types";

export const STATUS_LABEL: Record<ComparabilityStatus, string> = {
  COMPARABLE: "Comparable",
  ADJUSTED: "Adjusted",
  PARTIALLY_COMPARABLE: "Partially comparable",
  NOT_COMPARABLE: "Not comparable",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
};

export const READINESS_LABEL: Record<Readiness, string> = { READY: "Ready", REVIEW: "Review", BLOCKED: "Blocked" };

export const CHECK_LABEL: Record<CheckStatus, string> = {
  PASS: "Pass",
  INFO: "Info",
  CAUTION: "Caution",
  FAIL: "Fail",
  NOT_ASSESSED: "Not assessed",
  NOT_APPLICABLE: "Not applicable",
};

export const BASIS_LABEL: Record<SourceBasis, string> = { DIRECT_REPORTED: "Reported", DERIVED: "Derived", UNAVAILABLE: "Unavailable" };

const cell = (s: string | null | undefined) => (s ?? "—").replace(/\|/g, "\\|");

export function auditToMarkdown(a: ComparabilityAudit, checked: boolean[] = []): string {
  const [ca, cb] = a.companies;
  const lines: string[] = [
    `# Comparability audit: ${ca.ticker} vs ${cb.ticker}`,
    "",
    `${ca.name} (${ca.ticker}) and ${cb.name} (${cb.ticker}). Requested period: ${a.requestedPeriod === "latest" ? "latest fiscal year" : `FY${a.requestedPeriod}`}.`,
    `Generated ${a.generatedAt}. Audit ID ${a.auditId}.`,
    "",
    `**Overall: ${STATUS_LABEL[a.overallStatus]}.** ${a.overallAssessment}`,
    "",
  ];
  if (a.integrity) lines.push(`**Readiness (financial comparison integrity):** ${a.integrity.verdict}`, "", ...a.integrity.coverage.map((c) => `- ${c}`), "");
  if (a.aiInterpretation) lines.push(`> AI interpretation (grounded in the findings below, does not change them): ${a.aiInterpretation}`, "");

  const v2 = a.metrics.some((m) => m.integrity);
  lines.push("| Metric | Status | " + `${ca.ticker} | ${cb.ticker} | Evidence |` + (v2 ? " Readiness |" : ""), "|---|---|---|---|---|" + (v2 ? "---|" : ""));
  for (const m of a.metrics) {
    const v = m.values.map((x) => (x.display ? `${x.display} (FY${x.fiscalYear}, ended ${x.periodEnd}${x.sourceBasis ? `, ${BASIS_LABEL[x.sourceBasis].toLowerCase()}` : ""})` : "not available"));
    lines.push(
      `| ${m.label} | ${STATUS_LABEL[m.status]} | ${cell(v[0])} | ${cell(v[1])} | ${m.evidenceQuality.toLowerCase()} |` +
        (v2 ? ` ${m.integrity ? READINESS_LABEL[m.integrity.readiness] : "—"} |` : ""),
    );
  }
  lines.push("");

  for (const m of a.metrics) {
    lines.push(`## ${m.label}: ${STATUS_LABEL[m.status]}`, "", `_Definition:_ ${m.definition}`, "", m.explanation, "");
    const g = m.integrity;
    if (g) {
      lines.push(`Readiness: ${READINESS_LABEL[g.readiness]}. ${g.withheldConclusionReason ? `Conclusion withheld: ${g.withheldConclusionReason}` : g.allowableConclusion}`, "");
      lines.push(`Analyst action: ${g.analystAction}`, "");
      if (g.trend) lines.push(`Multi-year trend readiness: ${READINESS_LABEL[g.trend.readiness]}. ${g.trend.summary}`, "");
      lines.push("Integrity checks:");
      for (const c of g.checks) {
        lines.push(`- [${c.status}] ${c.title}${c.ticker ? ` (${c.ticker})` : ""}: ${c.finding} ${c.implication}`);
        for (const r of c.references ?? []) lines.push(`  - ${r.label}, accession ${r.accession}: ${r.url}`);
      }
      lines.push("");
      if (g.coverage.notAssessed.length) lines.push(`Not assessed: ${g.coverage.notAssessed.join(", ")}.`, "");
    }
    if (m.checks.length) {
      lines.push("Checks:");
      for (const c of m.checks) lines.push(`- [${c.passed ? "pass" : "flag"}] ${c.id}: ${c.detail}`);
      lines.push("");
    }
    if (m.adjustments.length) {
      lines.push("Adjustments and derivations:");
      for (const ad of m.adjustments) lines.push(`- ${ad.description}. Formula: \`${ad.formula}\`${ad.outputDisplay ? ` = ${ad.outputDisplay}` : ""}`);
      lines.push("");
    }
    if (m.caveats.length) {
      lines.push("Caveats:");
      for (const c of m.caveats) lines.push(`- ${c}`);
      lines.push("");
    }
    if (m.aiNotes.length) {
      lines.push("AI notes:");
      for (const n of m.aiNotes) lines.push(`- ${n}`);
      lines.push("");
    }
    const ev = m.values.flatMap((v) => v.evidence);
    const seen = new Set<string>();
    if (ev.length) {
      lines.push("Sources:");
      for (const e of ev) {
        if (seen.has(e.sourceId)) continue;
        seen.add(e.sourceId);
        lines.push(`- ${e.documentTitle}, accession ${e.accessionNumber}${e.xbrlConcept ? `, ${e.xbrlConcept}` : ""}: ${e.documentUrl}`);
      }
      lines.push("");
    }
    lines.push(`Human review required: ${m.requiresHumanReview ? "yes" : "no"}`, "");
  }

  lines.push("## Analyst review checklist", "");
  a.reviewChecklist.forEach((item, i) => lines.push(`- [${checked[i] ? "x" : " "}] ${item}`));
  lines.push("", "## Limitations", "");
  for (const l of a.limitations) lines.push(`- ${l}`);
  lines.push("");
  return lines.join("\n");
}
