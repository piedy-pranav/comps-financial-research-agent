import { planLabel, type Plan } from "@/lib/plans";

// Visual shell only. `remaining` is for Step 3 (usage); until then it is not passed, so no count is shown.
export function PlanBadge({ plan, remaining }: { plan: Plan; remaining?: number }) {
  const text = plan === "pro" ? "Pro" : "Free";
  return (
    <span
      title={planLabel(plan)}
      className="inline-flex h-7 items-center rounded-full border border-line px-2.5 text-xs text-ink-2"
    >
      {text}
      {remaining !== undefined && <span className="text-ink-3">&nbsp;· {remaining} left</span>}
    </span>
  );
}
