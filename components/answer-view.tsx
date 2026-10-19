"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { rewriteQuestion } from "@/lib/agent/clarify";
import type { AgentResult, Clarification, Source } from "@/lib/agent/types";

const MARKER = /\[(\d+)\]/g;

// Turn "[1]" markers in markdown into links to the sources list. A marker with no matching source
// is left as plain text, never a dead link.
function linkMarkers(markdown: string, known: Set<string>): string {
  return markdown.replace(MARKER, (m, n) => (known.has(n) ? `[\\[${n}\\]](#source-${n})` : m));
}

function Marker({ n }: { n: string }) {
  return (
    <sup>
      <a href={`#source-${n}`} className="text-blue-600 hover:underline">
        [{n}]
      </a>
    </sup>
  );
}

// Table cells are plain strings that may contain [n] markers.
function renderCell(text: string, known: Set<string>): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKER)) {
    const idx = m.index ?? 0;
    if (!known.has(m[1])) continue;
    if (idx > last) parts.push(text.slice(last, idx));
    parts.push(<Marker key={idx} n={m[1]} />);
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const looksNumeric = (s: string) => /^[-$(]?[\d.,]+[%BMK)]?/.test(s.trim());

function SourceItem({ s }: { s: Source }) {
  return (
    <li id={`source-${s.n}`} className="scroll-mt-4">
      <span className="font-medium text-slate-700">[{s.n}]</span>{" "}
      {s.type === "filing" ? (
        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
          {s.ticker} {s.form} · FY{s.fiscalYear} (ended {s.periodEnd}) · filed {s.filed}
        </a>
      ) : (
        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
          {s.title} · {s.domain}
        </a>
      )}
    </li>
  );
}

// Shown when a company name was ambiguous: up to 3 clickable candidates, or type the exact name or ticker.
function ClarifyChoices({
  clarification,
  onAsk,
}: {
  clarification: Clarification;
  onAsk: (question: string) => void;
}) {
  const [typed, setTyped] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = typed.trim();
    if (name) onAsk(rewriteQuestion(clarification.question, clarification.query, name));
  }

  return (
    <div className="mt-4 space-y-3">
      {clarification.options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {clarification.options.map((o) => (
            <button
              key={o.ticker}
              type="button"
              onClick={() => onAsk(o.question)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
            >
              {o.name} ({o.ticker})
            </button>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="clarify-company" className="sr-only">
          Company name or ticker
        </label>
        <input
          id="clarify-company"
          type="text"
          value={typed}
          maxLength={100}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Or type the exact company name or ticker"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        />
        <button
          type="submit"
          disabled={!typed.trim()}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </div>
  );
}

export function AnswerView({
  result,
  onAsk,
}: {
  result: AgentResult;
  onAsk: (question: string) => void;
}) {
  const { answer } = result;
  const isRealAnswer = answer.kind === "answer";
  const knownSources = new Set(answer.sources.map((s) => String(s.n)));

  return (
    <section className="space-y-4">
      <div
        className={
          isRealAnswer
            ? "rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            : "rounded-xl border border-slate-200 bg-slate-50 p-4"
        }
      >
        <h2 className="text-sm font-semibold text-slate-900">
          {isRealAnswer ? "Answer" : "Comps says"}
        </h2>
        <div className="mt-2 space-y-3 text-sm leading-6 text-slate-700 [&_a]:text-blue-600 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:w-full [&_table]:text-left [&_th]:border-b [&_th]:py-1 [&_td]:py-1">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) =>
                href?.startsWith("#source-") ? (
                  <sup>
                    <a href={href} className="text-blue-600 hover:underline">
                      {children}
                    </a>
                  </sup>
                ) : (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
            }}
          >
            {linkMarkers(answer.answerMarkdown, knownSources)}
          </ReactMarkdown>
        </div>

        {answer.kind === "clarification" && answer.clarification && (
          <ClarifyChoices clarification={answer.clarification} onAsk={onAsk} />
        )}

        {isRealAnswer &&
          answer.tables.map((table, ti) => (
          <div key={ti} className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{table.title}</h3>
            <div className="mt-1 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    {table.columns.map((c, ci) => (
                      <th key={ci} className={`py-1.5 pr-4 font-medium ${ci > 0 ? "text-right" : ""}`}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, ri) => (
                    <tr key={ri} className="border-b border-slate-100 last:border-0">
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className={`py-1.5 pr-4 ${ci > 0 && looksNumeric(cell) ? "text-right tabular-nums" : ""}`}
                        >
                          {renderCell(cell, knownSources)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {answer.notes.length > 0 && (
          <ul className="mt-4 space-y-1 rounded-md bg-amber-50 px-4 py-3 text-xs text-amber-900">
            {answer.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}

        {isRealAnswer && answer.sources.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sources</h3>
            <ol className="mt-1 space-y-1 text-xs">
              {answer.sources.map((s) => (
                <SourceItem key={s.n} s={s} />
              ))}
            </ol>
          </div>
        )}

        {isRealAnswer && (
          <p className="mt-4 text-xs text-slate-400">Figures from SEC filings. Not investment advice.</p>
        )}
      </div>

      {answer.followUps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {answer.followUps.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onAsk(q)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
