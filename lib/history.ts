import "server-only";
import { createClient } from "./supabase/server";
import { parsePersistedRun, statusLabel, type HistoryRow, type PersistedRun } from "./history-parse";

// Read-side access to Research History (docs/RESEARCH_HISTORY_PLAN.md). Uses the cookie-scoped Supabase client,
// so the `runs` RLS policy ("Users can read their own runs") applies; the explicit user_id filter is a second
// layer. No admin key, no agent, no usage counting: this only reads rows that already exist.

export const HISTORY_LIMIT = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type { HistoryRow };
export type HistoryRun = { id: string; question: string; createdAt: string; run: PersistedRun };

// `kind` is pulled out of the jsonb server-side so the list never downloads whole traces.
type ListRecord = { id: string; question: string; status: string; created_at: string; kind: string | null };

export async function listHistory(userId: string): Promise<{ ok: true; rows: HistoryRow[] } | { ok: false }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("runs")
      .select("id, question, status, created_at, kind:trace->answer->>kind")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT)
      .returns<ListRecord[]>();
    if (error) throw new Error(error.message);
    return {
      ok: true,
      rows: (data ?? []).map((r) => {
        const label = statusLabel(r.kind, r.status);
        return { id: r.id, question: r.question, createdAt: r.created_at, label, failed: label !== "Answer" };
      }),
    };
  } catch (err) {
    console.error("[history] list failed", err instanceof Error ? err.message : err);
    return { ok: false };
  }
}

type DetailRecord = { id: string; question: string; answer: string | null; trace: unknown; status: string; created_at: string };

// "missing" covers an invalid id, a nonexistent run and another user's run alike, so ownership is never revealed.
export async function getHistoryRun(
  userId: string,
  id: string,
): Promise<{ state: "ok"; run: HistoryRun } | { state: "missing" } | { state: "error" }> {
  if (!UUID.test(id)) return { state: "missing" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("runs")
      .select("id, question, answer, trace, status, created_at")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle<DetailRecord>();
    if (error) throw new Error(error.message);
    if (!data) return { state: "missing" };
    return {
      state: "ok",
      run: {
        id: data.id,
        question: data.question,
        createdAt: data.created_at,
        run: parsePersistedRun(data.trace, data.answer, data.status),
      },
    };
  } catch (err) {
    console.error("[history] detail failed", err instanceof Error ? err.message : err);
    return { state: "error" };
  }
}
