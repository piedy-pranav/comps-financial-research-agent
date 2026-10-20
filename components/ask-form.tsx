"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, AgentResult, TraceStep } from "@/lib/agent/types";
import type { UsageDenial } from "@/lib/usage-types";
import { PRO_DAILY_LIMIT, PRO_PRICE_USD } from "@/lib/plans";
import { validateQuestion } from "@/lib/validation";
import { NEW_QUESTION_EVENT } from "./layout/events";
import { AgentTrace } from "./agent-trace";
import { AnswerView } from "./answer-view";
import { ExampleQuestions } from "./research/example-questions";
import { QuestionComposer } from "./research/question-composer";
import { QuestionHeader } from "./research/question-header";
import { StatePanel } from "./research/state-panel";

const EXAMPLES = [
  "Compare Nike, Lululemon, and Under Armour's gross margin over the last 5 years",
  "How has Deckers' revenue and operating income grown since 2020?",
  "Compare Nike and Under Armour's inventory and operating cash flow trends",
  "How have VF Corp's margins changed over the last 5 years?",
];

// The research workspace: owns the question, the streamed trace and the final result.
export function AskForm() {
  const [draft, setDraft] = useState(""); // what is typed in the composer
  const [asked, setAsked] = useState<string | null>(null); // the question being researched
  const [loading, setLoading] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null); // the question was rejected before any request
  const [runError, setRunError] = useState<string | null>(null); // the request or the run failed
  const [limit, setLimit] = useState<UsageDenial | null>(null); // HTTP 402: out of questions (not an error)
  const router = useRouter();
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function ask(raw: string) {
    const validation = validateQuestion(raw);
    if (!validation.ok) {
      setInputError(validation.error);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setAsked(validation.question);
    setDraft("");
    setLoading(true);
    setInputError(null);
    setRunError(null);
    setLimit(null);
    setSteps([]);
    setResult(null);
    window.scrollTo({ top: 0 });

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: validation.question }),
        signal: controller.signal,
      });

      // Auth, validation and limit errors come back as plain JSON before streaming starts.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        if (res.status === 402 && (data?.code === "FREE_LIMIT_REACHED" || data?.code === "DAILY_LIMIT_REACHED")) {
          setLimit(data as UsageDenial);
          router.refresh(); // sync the plan badge with the server's count
          return;
        }
        setRunError(data?.error ?? "Something went wrong. Please try again.");
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
          setRunError(event.message);
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

      // The run is persisted by now, so re-render the server-side plan badge with the new remaining count.
      if (gotFinal) router.refresh();
      if (!gotFinal) setRunError("The connection ended before an answer arrived. Please try again.");
    } catch {
      // A reset or unmount aborts the request on purpose; that is not an error to show.
      if (!controller.signal.aborted) setRunError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }

  // Back to the empty state (the sidebar's "New question"). Aborting also cancels the run on the server.
  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setDraft("");
    setAsked(null);
    setLoading(false);
    setInputError(null);
    setRunError(null);
    setLimit(null);
    setSteps([]);
    setResult(null);
  }, []);

  useEffect(() => {
    window.addEventListener(NEW_QUESTION_EVENT, reset);
    return () => {
      window.removeEventListener(NEW_QUESTION_EVENT, reset);
      abortRef.current?.abort();
    };
  }, [reset]);

  const started = asked !== null;

  if (!started) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-4 pb-24 pt-12 sm:px-6">
        <h1 className="text-balance text-center text-2xl font-medium text-ink sm:text-[28px]">
          Research companies with cited financials
        </h1>
        <p className="mt-2 text-center text-[15px] text-ink-3">
          Compare fundamentals across years and peers using SEC filings.
        </p>
        <div className="mt-8">
          <QuestionComposer
            variant="hero"
            value={draft}
            onChange={(v) => {
              setDraft(v);
              setInputError(null);
            }}
            onSubmit={() => void ask(draft)}
            loading={loading}
            inputError={inputError}
            autoFocus
          />
        </div>
        <ExampleQuestions questions={EXAMPLES} onPick={(q) => void ask(q)} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-(--answer-max) flex-1 px-4 pb-10 pt-8 sm:px-6 sm:pt-10">
        <QuestionHeader question={asked} />
        <AgentTrace steps={steps} loading={loading} />

        {limit && <LimitPanel denial={limit} />}

        {runError && (
          <div className="mt-8">
            <StatePanel tone="error" title="We couldn't complete this research">
              <p>{runError}</p>
              <button
                type="button"
                onClick={() => void ask(asked)}
                className="mt-3 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 transition-colors duration-150 hover:border-line-strong hover:bg-subtle hover:text-ink"
              >
                Try again
              </button>
            </StatePanel>
          </div>
        )}

        {result && <AnswerView result={result} onAsk={(q) => void ask(q)} retryQuestion={asked} />}
      </div>

      <div className="sticky bottom-0 z-10 bg-gradient-to-t from-canvas from-70% to-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <div className="mx-auto w-full max-w-(--answer-max) px-4 sm:px-6">
          <QuestionComposer
            variant="dock"
            value={draft}
            onChange={(v) => {
              setDraft(v);
              setInputError(null);
            }}
            onSubmit={() => void ask(draft)}
            loading={loading}
            inputError={inputError}
          />
        </div>
      </div>
    </div>
  );
}

function formatReset(iso: string | null) {
  if (!iso) return "midnight UTC";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "midnight UTC";
  return `${d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" })} (midnight UTC)`;
}

// 402 from /api/agent: the user is out of questions. Informational, not a server error.
function LimitPanel({ denial }: { denial: UsageDenial }) {
  if (denial.code === "FREE_LIMIT_REACHED") {
    return (
      <div className="mt-8">
        <StatePanel title={`You've used all ${denial.usage.limit} free questions`}>
          <p>Upgrade to Pro for {PRO_DAILY_LIMIT} questions a day. One-time ${PRO_PRICE_USD}, no subscription.</p>
          <Link
            href="/pricing"
            className="mt-3 inline-block rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-canvas transition-opacity duration-150 hover:opacity-90"
          >
            Upgrade to Pro
          </Link>
        </StatePanel>
      </div>
    );
  }
  return (
    <div className="mt-8">
      <StatePanel title="You've reached today's limit">
        <p>
          You&rsquo;ve used all {denial.usage.limit} questions for today. Your limit resets {formatReset(denial.usage.resetAt)}.
        </p>
      </StatePanel>
    </div>
  );
}
