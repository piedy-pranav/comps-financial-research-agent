import { AlertIcon, CheckIcon, InfoIcon, XIcon } from "@/components/ui/icons";
import { CHECK_LABEL, READINESS_LABEL } from "@/lib/audit/report";
import type { CheckStatus, Readiness } from "@/lib/audit/types";

// Shared by the research-answer panel and /audit. Solid fills with white text (contrast checked in BIG_AUDIT A23).
const READINESS_STYLE: Record<Readiness, string> = {
  READY: "border-pos bg-pos text-white",
  REVIEW: "border-warn bg-warn text-white",
  BLOCKED: "border-neg bg-neg text-white",
};

export function ReadinessBadge({ readiness, size = "md" }: { readiness: Readiness; size?: "sm" | "md" }) {
  const pad = size === "sm" ? "px-2 py-px text-[11px]" : "px-2.5 py-0.5 text-[12px]";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border font-medium ${pad} ${READINESS_STYLE[readiness]}`}>
      {READINESS_LABEL[readiness]}
    </span>
  );
}

const CHECK_TEXT: Record<CheckStatus, string> = {
  PASS: "text-pos",
  INFO: "text-ink-3",
  CAUTION: "text-warn",
  FAIL: "text-neg",
  NOT_ASSESSED: "text-ink-3",
  NOT_APPLICABLE: "text-ink-4",
};

// Only PASS gets a check mark; NOT_ASSESSED and NOT_APPLICABLE get none, so nothing unchecked reads as passed.
export function CheckStatusIcon({ status }: { status: CheckStatus }) {
  const cls = `mt-0.5 shrink-0 ${CHECK_TEXT[status]}`;
  if (status === "PASS") return <CheckIcon size={14} className={cls} />;
  if (status === "FAIL") return <XIcon size={14} className={cls} />;
  if (status === "CAUTION") return <AlertIcon size={14} className={cls} />;
  if (status === "INFO") return <InfoIcon size={14} className={cls} />;
  return <span aria-hidden className={`mt-[7px] inline-block h-px w-3.5 shrink-0 bg-current ${CHECK_TEXT[status]}`} />;
}

export function CheckStatusLabel({ status }: { status: CheckStatus }) {
  return <span className={`text-[11px] font-medium uppercase tracking-wider ${CHECK_TEXT[status]}`}>{CHECK_LABEL[status]}</span>;
}
