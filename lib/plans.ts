// Plan names and limits from docs/PRD.md. Keep the numbers here so the
// pricing page and lib/usage.ts never drift apart.

export type Plan = "free" | "pro";

export const FREE_QUESTION_LIMIT = 3; // total successful questions on Free
export const PRO_DAILY_LIMIT = 25; // successful questions per day on Pro
export const PRO_PRICE_USD = 19; // one-time

export function planLabel(plan: Plan) {
  return plan === "pro" ? "Pro plan" : "Free plan";
}
