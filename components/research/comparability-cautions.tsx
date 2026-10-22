import Link from "next/link";
import { CheckStatusIcon, CheckStatusLabel, ReadinessBadge, ReadinessLegend } from "@/components/audit/integrity-badges";
import { AlertIcon, ArrowUpRightIcon, CheckIcon, InfoIcon } from "@/components/ui/icons";
import { BASIS_LABEL, INTEGRITY_SUBTITLE, INTEGRITY_TITLE, READINESS_LABEL, STATUS_LABEL } from "@/lib/audit/report";
import type { Readiness, ResearchAuditFinding, ResearchAuditSummary } from "@/lib/audit/types";

const COVERAGE =
  "Integrity checks cover revenue, operating income, operating margin and net income where sufficient evidence is available. Other metrics in this research have not been audited.";
const NOT_ASSESSED_ANYWHERE = "Not assessed for any metric: accounting-policy and footnote equivalence.";

const STATUS_TEXT: Record<ResearchAuditFinding["status"], string> = {
  COMPARABLE: "text-pos",
  ADJUSTED: "text-accent",
  PARTIALLY_COMPARABLE: "text-warn",
  NOT_COMPARABLE: "text-neg",
  INSUFFICIENT_EVIDENCE: "text-ink-3",
};

const ORDER: Record<Readiness, number> = { BLOCKED: 0, REVIEW: 1, READY: 2 };

function auditHref(pair: string, period: string) {
  const [a, b] = pair.split(" vs ");
  const p = /^FY(\d{4})$/.exec(period)?.[1] ?? "latest";
  return `/audit?a=${encodeURIComponent(a ?? "")}&b=${encodeURIComponent(b ?? "")}&period=${p}`;
}

function EvidenceLinks({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
      {urls.map((u, j) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs text-ink-3 transition-colors hover:text-ink">
          SEC filing {j + 1}
          <ArrowUpRightIcon size={11} />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ))}
    </div>
  );
}

// "Operating income, Operating margin (NKE vs UAA)" for the summary lines.
function metricList(findings: ResearchAuditFinding[], multiPair: boolean) {
  return findings.map((f) => (multiPair ? `${f.metric} (${f.pair})` : f.metric)).join(", ");
}

// Why a metric's comparison is not supported: the first sentence of its first failing check, without the
// "Operating income:" prefix an inherited (margin) check carries.
function blockReason(f: ResearchAuditFinding): string {
  const fail = f.checks?.find((c) => c.status === "FAIL");
  if (!fail) return "the evidence does not support it.";
  const text = fail.finding.replace(/^(Revenue|Operating income): /, "");
  return /^.*?\.(?=\s|$)/.exec(text)?.[0] ?? text;
}

// V2: one audited conclusion (metric x pair) with its readiness, what limits it and what to do next.
function IntegrityFinding({ f, multiPair }: { f: ResearchAuditFinding; multiPair: boolean }) {
  // Fixed coverage limits are stated once in the footer, not repeated per metric. A blocked metric lists only what
  // blocks or qualifies it; checks skipped because a value is missing are in the detailed audit.
  const flagged = (f.checks ?? []).filter(
    (c) => c.id !== "revisions" && c.id !== "accounting_policy" && (f.readiness !== "BLOCKED" || c.status === "FAIL" || c.status === "CAUTION"),
  );
  const basis = Object.entries(f.sourceBasis ?? {});
  return (
    <li className="text-[13px] leading-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-ink">{f.metric}</span>
          {multiPair && <span className="text-ink-4">· {f.pair}</span>}
          <ReadinessBadge readiness={f.readiness!} size="sm" />
          <span className={`text-xs ${STATUS_TEXT[f.status]}`}>Comparability status: {STATUS_LABEL[f.status]}</span>
        </div>
        {f.conclusion && <p className="mt-0.5 text-ink-2">{f.conclusion}</p>}
        {flagged.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {flagged.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs leading-5 text-ink-2">
                <CheckStatusIcon status={c.status} />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <CheckStatusLabel status={c.status} /> <span className="text-ink-3">{c.title}{c.ticker ? ` (${c.ticker})` : ""}:</span> {c.finding}
                </span>
              </li>
            ))}
          </ul>
        )}
        {f.trend && (
          <p className="mt-1 text-xs leading-5 text-ink-3">
            Multi-year trend (separate from this year): <span className="font-medium text-ink-2">{READINESS_LABEL[f.trend.readiness]}</span>
            {f.trend.readiness !== "READY" ? ` · ${f.trend.summary}` : ""}
          </p>
        )}
        <p className="mt-1 text-xs leading-5 text-ink-3">
          {basis.length > 0 && <>Source basis: {basis.map(([t, b]) => `${t} ${BASIS_LABEL[b].toLowerCase()}`).join(" · ")}. </>}
          {f.readiness !== "READY" && f.analystAction && <>Next step: {f.analystAction}</>}
        </p>
        {f.readiness !== "READY" && <EvidenceLinks urls={f.evidenceUrls} />}
      </div>
    </li>
  );
}

function LegacyFindings({ audit, multiPair }: { audit: ResearchAuditSummary; multiPair: boolean }) {
  const issues = audit.findings.filter((f) => f.status !== "COMPARABLE");
  const ok = audit.findings.filter((f) => f.status === "COMPARABLE");
  return (
    <>
      {issues.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {issues.map((f, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <AlertIcon size={14} className={`mt-1 shrink-0 ${STATUS_TEXT[f.status]}`} />
              <div className="min-w-0 text-[13px] leading-5">
                <div>
                  <span className="font-medium text-ink">{f.metric}</span>
                  {multiPair && <span className="text-ink-4"> · {f.pair}</span>}
                  <span className={`ml-2 text-xs ${STATUS_TEXT[f.status]}`}>{STATUS_LABEL[f.status]}</span>
                </div>
                <p className="mt-0.5 text-ink-2">{f.explanation}</p>
                <EvidenceLinks urls={f.evidenceUrls} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 flex items-start gap-2 text-[13px] leading-5 text-ink-2">
          <CheckIcon size={14} className="mt-0.5 shrink-0 text-pos" />
          {audit.checkedMetrics.length} supported metric{audit.checkedMetrics.length === 1 ? "" : "s"} checked; no material issues identified for the audited period.
        </p>
      )}
      {issues.length > 0 && ok.length > 0 && (
        <p className="mt-3 flex items-start gap-2 text-[13px] leading-5 text-ink-3">
          <CheckIcon size={14} className="mt-0.5 shrink-0 text-pos" />
          Checked, no issues: {ok.map((f) => (multiPair ? `${f.metric} (${f.pair})` : f.metric)).join(", ")}.
        </p>
      )}
    </>
  );
}

// Deterministic integrity review shown above a research answer. The answer was generated (and streamed) before this
// review ran and is never edited by it, so the review states which of the answer's comparisons to withhold or
// qualify. Summaries saved before V2 have no readiness and render the earlier comparability view.
export function ComparabilityCautions({ audit }: { audit: ResearchAuditSummary }) {
  const pairs = [...new Set(audit.findings.map((f) => f.pair))];
  const multiPair = pairs.length > 1;
  const v2 = audit.findings.length > 0 && audit.findings.every((f) => f.readiness);
  const sorted = [...audit.findings].sort((a, b) => ORDER[a.readiness ?? "READY"] - ORDER[b.readiness ?? "READY"]);
  const blocked = sorted.filter((f) => f.readiness === "BLOCKED");
  const review = sorted.filter((f) => f.readiness === "REVIEW");
  const ready = sorted.filter((f) => f.readiness === "READY");
  const trendBlocked = sorted.filter((f) => f.readiness !== "BLOCKED" && f.trend && f.trend.readiness === "BLOCKED");
  const legacyIssues = audit.findings.some((f) => f.status !== "COMPARABLE");

  return (
    <section aria-label="Financial comparison integrity" className="mt-8 rounded-md border border-line-subtle bg-raised px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
          {v2 ? INTEGRITY_TITLE : legacyIssues ? "Comparability cautions" : "Comparability review"}
        </h2>
        <span className="text-xs text-ink-4">Audited period: {audit.auditedPeriod}</span>
      </div>
      {v2 && <p className="mt-1 text-xs leading-5 text-ink-3">{INTEGRITY_SUBTITLE}</p>}

      {audit.status === "unavailable" ? (
        <p className="mt-2 flex items-start gap-2 text-[13px] leading-5 text-ink-2">
          <InfoIcon size={14} className="mt-0.5 shrink-0 text-ink-3" />
          Comparison integrity review unavailable. The financial research below remains available, but its cross-company comparability has not been
          independently checked by the audit engine.
        </p>
      ) : (
        <>
          {audit.periodDetails.length > 0 && <p className="mt-1 text-xs leading-5 text-ink-4 [overflow-wrap:anywhere]">{audit.periodDetails.join(" · ")}</p>}

          {v2 ? (
            <>
              <div role="note" className="mt-3 space-y-1.5 rounded-md border border-line bg-canvas px-3 py-2 text-[13px] leading-5 text-ink-2">
                {blocked.length > 0 && (
                  <div>
                    <p>
                      <span className="font-medium text-neg">Comparison not supported:</span> {metricList(blocked, multiPair)}. The sourced figures are shown,
                      but do not use them to conclude which company performs better.
                    </p>
                    <ul className="mt-0.5 list-disc pl-5 text-xs leading-5 text-ink-3">
                      {blocked.map((f, i) => (
                        <li key={i}>
                          {multiPair ? `${f.metric} (${f.pair})` : f.metric}: {blockReason(f)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {review.length > 0 && (
                  <p>
                    <span className="font-medium text-warn">{READINESS_LABEL.REVIEW}:</span> {metricList(review, multiPair)}. Read the qualifications below before
                    drawing conclusions.
                  </p>
                )}
                {ready.length > 0 && (
                  <p>
                    <span className="font-medium text-pos">{READINESS_LABEL.READY}:</span> {metricList(ready, multiPair)}, for the audited year.
                  </p>
                )}
                {trendBlocked.length > 0 && (
                  <p className="border-t border-line-subtle pt-1.5">
                    <span className="font-medium text-ink">Multi-year growth (separate from the audited year):</span> growth across a break in the annual series is
                    not supported for {metricList(trendBlocked, multiPair)}. Years on either side of the break remain usable.
                  </p>
                )}
                <p className="text-xs text-ink-4">The research answer above was written before this review and is not edited by it.</p>
              </div>
              <ul className="mt-3 space-y-3">
                {sorted.map((f, i) => (
                  <IntegrityFinding key={i} f={f} multiPair={multiPair} />
                ))}
              </ul>
            </>
          ) : (
            <LegacyFindings audit={audit} multiPair={multiPair} />
          )}
        </>
      )}

      <div className="mt-3 space-y-1 border-t border-line-subtle pt-3 text-xs leading-5 text-ink-4">
        {audit.limitations.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
        {audit.uncheckedMetrics.length > 0 && <p>Not audited in this research: {audit.uncheckedMetrics.join(", ")}.</p>}
        <p>{COVERAGE}</p>
        {v2 && (
          <>
            <ReadinessLegend states={audit.findings.map((f) => f.readiness!)} />
            <p>
              {NOT_ASSESSED_ANYWHERE} &ldquo;{READINESS_LABEL.READY}&rdquo; means the checks performed found no issue, not that the companies&rsquo; accounting
              policies are equivalent.
            </p>
          </>
        )}
        {pairs.length > 0 && (
          <p className="flex flex-wrap gap-x-3">
            {pairs.map((p) => (
              <Link key={p} href={auditHref(p, audit.auditedPeriod)} className="text-ink-3 underline-offset-2 hover:text-ink hover:underline">
                View detailed audit{multiPair ? ` (${p})` : ""}
              </Link>
            ))}
          </p>
        )}
      </div>
    </section>
  );
}
