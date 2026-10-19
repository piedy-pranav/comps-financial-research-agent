"use client";

import type { TraceStep } from "@/lib/agent/types";

type Row =
  | { kind: "thought"; text: string }
  | { kind: "info"; text: string }
  | { kind: "action"; id: string; label: string; done: boolean; ok: boolean; summary: string };

function toRows(steps: TraceStep[]): Row[] {
  const observations = new Map<string, Extract<TraceStep, { type: "observation" }>>();
  for (const s of steps) if (s.type === "observation") observations.set(s.id, s);

  const rows: Row[] = [];
  for (const s of steps) {
    if (s.type === "thought") rows.push({ kind: "thought", text: s.text });
    else if (s.type === "info") rows.push({ kind: "info", text: s.text });
    else if (s.type === "action") {
      const obs = observations.get(s.id);
      rows.push({
        kind: "action",
        id: s.id,
        label: s.label,
        done: !!obs,
        ok: obs?.ok ?? false,
        summary: obs?.summary ?? "",
      });
    }
  }
  return rows;
}

export function AgentTrace({ steps, loading }: { steps: TraceStep[]; loading: boolean }) {
  if (!steps.length && !loading) return null;
  const rows = toRows(steps);
  const actionCount = rows.filter((r) => r.kind === "action").length;

  return (
    <details open={loading} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">
        {loading ? "Researching…" : `Researched in ${actionCount} step${actionCount === 1 ? "" : "s"}`}
      </summary>
      <ol className="mt-3 space-y-2 text-sm">
        {rows.map((row, i) => {
          if (row.kind === "thought") {
            return (
              <li key={i} className="text-xs italic text-slate-400">
                {row.text}
              </li>
            );
          }
          if (row.kind === "info") {
            return (
              <li key={i} className="text-xs text-amber-700">
                {row.text}
              </li>
            );
          }
          return (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 w-4 shrink-0 text-center">
                {!row.done ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                ) : row.ok ? (
                  <span className="text-emerald-600">✓</span>
                ) : (
                  <span className="text-red-600">✗</span>
                )}
              </span>
              <span>
                <span className="text-slate-800">{row.label}</span>
                {row.done && <span className="ml-2 text-slate-500">{row.summary}</span>}
              </span>
            </li>
          );
        })}
        {loading && !rows.length && <li className="text-slate-500">Starting…</li>}
      </ol>
    </details>
  );
}
