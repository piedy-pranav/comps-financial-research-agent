"use client";

import { useState, type FormEvent } from "react";
import type { AgentEvent, AgentResult, TraceStep } from "@/lib/agent/types";
import { MAX_QUESTION_LENGTH, validateQuestion } from "@/lib/validation";
import { AgentTrace } from "./agent-trace";
import { AnswerView } from "./answer-view";

const EXAMPLES = [
  "Compare Nike, Lululemon, and Under Armour's gross margin over the last 5 years",
  "How has Deckers' revenue and operating income grown since 2020?",
  "Compare Nike and Under Armour's inventory and operating cash flow trends",
  "How have VF Corp's margins changed over the last 5 years?",
];

export function AskForm() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [result, setResult] = useState<AgentResult | null>(null);

  async function ask(raw: string) {
    const validation = validateQuestion(raw);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setQuestion(validation.question);
    setLoading(true);
    setError(null);
    setSteps([]);
    setResult(null);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: validation.question }),
      });

      // Auth, validation and limit errors come back as plain JSON before streaming starts.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotFinal = false;

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        let event: AgentEvent;
        try {
          event = JSON.parse(line) as AgentEvent;
        } catch {
          return;
        }
        if (event.type === "step") setSteps((prev) => [...prev, event.step]);
        else if (event.type === "final") {
          gotFinal = true;
          setResult(event.result);
        } else if (event.type === "error") {
          gotFinal = true;
          setError(event.message);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(handleLine);
      }
      handleLine(buffer);

      if (!gotFinal) setError("The connection ended before an answer arrived. Please try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  const showExamples = !loading && !result && !steps.length;

  return (
    <div className="mt-8 space-y-6">
      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <textarea
          id="question"
          rows={4}
          maxLength={MAX_QUESTION_LENGTH}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={loading}
          placeholder="Compare Nike, Lululemon, and Under Armour's gross margin and revenue growth over the last 5 years."
          className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50"
        />
        <div className="mt-3 flex items-center justify-between gap-4">
          <span className="text-xs text-slate-400">
            {question.length}/{MAX_QUESTION_LENGTH}
          </span>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Thinking…" : "Ask"}
          </button>
        </div>
      </form>

      {showExamples && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Try one of these</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void ask(q)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <AgentTrace steps={steps} loading={loading} />

      {result && <AnswerView result={result} onAsk={(q) => void ask(q)} />}
    </div>
  );
}
