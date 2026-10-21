"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, AgentResult, AnswerExtras, TraceStep } from "@/lib/agent/types";
import type { ThreadDetail } from "@/lib/history";
import type { UsageDenial } from "@/lib/usage-types";
import { PRO_DAILY_LIMIT, PRO_PRICE_USD } from "@/lib/plans";
import { validateQuestion } from "@/lib/validation";
import { NEW_QUESTION_EVENT, THREAD_ACTIVITY_EVENT, type ThreadActivity } from "./layout/events";
import { AgentTrace } from "./agent-trace";
import { AnswerView, DraftAnswer } from "./answer-view";
import { SavedTime } from "./history/saved-time";
import { ExampleQuestions } from "./research/example-questions";
import { QuestionComposer } from "./research/question-composer";
import { QuestionHeader } from "./research/question-header";
import { StatePanel } from "./research/state-panel";
import { useFollowScroll } from "./research/use-follow-scroll";

const EXAMPLES = [
  "Compare Nike, Lululemon, and Under Armour's gross margin over the last 5 years",
  "How has Deckers' revenue and operating income grown since 2020?",
  "Compare Nike and Under Armour's inventory and operating cash flow trends",
  "How have VF Corp's margins changed over the last 5 years?",
];

// The research workspace: owns the question, the streamed trace and the final result. Without `initialThread` it is
// the empty-state home page, and the first answer creates a thread that later follow-ups in this session reuse.
// With `initialThread` (/history/[threadId]) it shows the saved turns and every question continues that thread.
export function AskForm({ initialThread }: { initialThread?: ThreadDetail }) {
  const turns = initialThread?.runs ?? [];
  const [threadId, setThreadId] = useState<string | null>(initialThread?.id ?? null);
  // How many saved turns existed when the live question was asked. Once the server re-renders with more, the live
  // turn has become a saved one and is hidden (derived, so no effect or duplicate).
  const [liveBase, setLiveBase] = useState(0);
  const liveRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef(initialThread?.title ?? ""); // thread title for the sidebar (the first question of a new thread)
  const [draft, setDraft] = useState(""); // what is typed in the composer
  const [asked, setAsked] = useState<string | null>(null); // the question being researched
  const [loading, setLoading] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null); // the question was rejected before any request
  const [runError, setRunError] = useState<string | null>(null); // the request or the run failed
  const [limit, setLimit] = useState<UsageDenial | null>(null); // HTTP 402: out of questions (not an error)
  const router = useRouter();
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [draftAnswer, setDraftAnswer] = useState(""); // provisional prose while the answer is written; replaced by `result`
  const [draftExtras, setDraftExtras] = useState<AnswerExtras | null>(null); // verified preview rows/sources/follow-ups
  const [draftDone, setDraftDone] = useState(false); // the preview has finished revealing after `final` arrived
  const refreshPending = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const follow = useFollowScroll(contentRef, loading || result !== null);

  async function ask(raw: string) {
    const validation = validateQuestion(raw);
    if (!validation.ok) {
      setInputError(validation.error);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setAsked(validation.question);
    setLiveBase(turns.length);
    setDraft("");
    setLoading(true);
    setInputError(null);
    setRunError(null);
    setLimit(null);
    setSteps([]);
    setResult(null);
    setDraftAnswer("");
    setDraftExtras(null);
    setDraftDone(false);
    refreshPending.current = false;
    if (!initialThread) window.scrollTo({ top: 0 });
    follow(); // follow the new research as it grows, until the reader scrolls up

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: validation.question, ...(threadId ? { threadId } : {}) }),
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

      // Follow-ups from here on belong to this thread (set by the server for new conversations).
      const returnedThread = res.headers.get("x-thread-id");
      if (returnedThread) {
        setThreadId(returnedThread);
        // Sidebar: show a new thread (or move a continued one to the top) now that the server has accepted the question.
        if (!threadId) titleRef.current = validation.question.slice(0, 120);
        window.dispatchEvent(
          new CustomEvent<ThreadActivity>(THREAD_ACTIVITY_EVENT, { detail: { id: returnedThread, title: titleRef.current } }),
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotFinal = false;
      let gotResult = false;

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        let event: AgentEvent;
        try {
          event = JSON.parse(line) as AgentEvent;
        } catch {
          return;
        }
        if (event.type === "step") setSteps((prev) => [...prev, event.step]);
        else if (event.type === "answer_delta") setDraftAnswer(event.text);
        else if (event.type === "answer_extras") setDraftExtras({ tables: event.tables, sources: event.sources, followUps: event.followUps });
        else if (event.type === "final") {
          gotFinal = true;
          gotResult = true;
          setResult(event.result); // the preview (if any) finishes revealing, then this takes over
        } else if (event.type === "error") {
          gotFinal = true;
          setDraftAnswer("");
          setDraftExtras(null);
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
      // With a result, refresh once it is actually on screen (see the effect below), so the saved turn does not
      // replace a preview that is still finishing. Errors have nothing to wait for.
      if (gotFinal && !gotResult) router.refresh();
      else if (gotResult) refreshPending.current = true;
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
    setThreadId(null); // "New question" always starts a new thread
    titleRef.current = "";
    setDraft("");
    setAsked(null);
    setLoading(false);
    setInputError(null);
    setRunError(null);
    setLimit(null);
    setSteps([]);
    setResult(null);
    setDraftAnswer("");
    setDraftExtras(null);
    setDraftDone(false);
    refreshPending.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener(NEW_QUESTION_EVENT, reset);
    return () => {
      window.removeEventListener(NEW_QUESTION_EVENT, reset);
      abortRef.current?.abort();
    };
  }, [reset]);

  // The validated answer is shown once any preview has finished revealing (or immediately if there was none).
  const resultVisible = result !== null && (!draftAnswer || draftDone);
  const previewVisible = !!draftAnswer && !runError && !(result !== null && draftDone);
  const handleDrained = useCallback(() => setDraftDone(true), []);

  useEffect(() => {
    if (resultVisible && refreshPending.current) {
      refreshPending.current = false;
      router.refresh();
    }
  }, [resultVisible, router]);

  const started = asked !== null;
  const liveVisible = started && (!initialThread || turns.length === liveBase);

  useEffect(() => {
    // Jump (not animate) so the follow-scroll sees a settled position; the hook then tracks growth.
    if (initialThread && asked) liveRef.current?.scrollIntoView({ block: "start" });
  }, [initialThread, asked]);

  if (!started && !initialThread) {
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

  const live = (
    <div ref={liveRef} className="scroll-mt-6">
      {initialThread ? <TurnHeader question={asked ?? ""} /> : <QuestionHeader question={asked ?? ""} />}
      <AgentTrace steps={steps} loading={loading} />

      {limit && <LimitPanel denial={limit} />}

      {runError && (
        <div className="mt-8">
          <StatePanel tone="error" title="We couldn't complete this research">
            <p>{runError}</p>
            <button
              type="button"
              onClick={() => void ask(asked ?? "")}
              className="mt-3 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 transition-colors duration-150 hover:border-line-strong hover:bg-subtle hover:text-ink"
            >
              Try again
            </button>
          </StatePanel>
        </div>
      )}

      {previewVisible && <DraftAnswer text={draftAnswer} extras={draftExtras} done={result !== null} onDrained={handleDrained} />}

      {resultVisible && result && <AnswerView result={result} onAsk={(q) => void ask(q)} retryQuestion={asked ?? undefined} />}
    </div>
  );

  return (
    <div className="flex flex-1 flex-col">
      <div ref={contentRef} className="mx-auto w-full max-w-(--answer-max) flex-1 px-4 pb-10 pt-8 sm:px-6 sm:pt-10">
        {initialThread && (
          <>
            <Link href="/history" className="text-[13px] text-ink-3 transition-colors duration-150 hover:text-ink">
              &larr; History
            </Link>
            <header className="mt-5">
              <p className="text-xs font-medium uppercase tracking-wider text-ink-3">Research thread</p>
              <h1 className="mt-2 text-balance text-2xl font-medium leading-snug text-ink [overflow-wrap:anywhere] sm:text-[28px]">
                {initialThread.title}
              </h1>
            </header>
            {turns.map((turn, i) => (
              <section key={turn.id} aria-label={`Question ${i + 1}`} className={i === 0 ? "mt-8" : "mt-12 border-t border-line-subtle pt-8"}>
                <TurnHeader question={turn.question} createdAt={turn.createdAt} />
                <AgentTrace steps={turn.run.steps} loading={false} />
                <AnswerView
                  result={{ status: "success", answer: turn.run.answer, trace: turn.run.steps }}
                  onAsk={i === turns.length - 1 && !liveVisible ? (q) => void ask(q) : undefined}
                />
              </section>
            ))}
          </>
        )}
        {liveVisible && (initialThread ? <section className="mt-12 border-t border-line-subtle pt-8">{live}</section> : live)}
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

// One turn's question inside a thread: a section heading under the thread title.
function TurnHeader({ question, createdAt }: { question: string; createdAt?: string }) {
  return (
    <header>
      <h2 className="text-balance text-lg font-medium leading-snug text-ink [overflow-wrap:anywhere] sm:text-xl">{question}</h2>
      {createdAt ? (
        <SavedTime iso={createdAt} className="mt-1.5 block text-xs text-ink-4" />
      ) : (
        <p className="mt-1.5 text-xs text-ink-4">Asked just now</p>
      )}
    </header>
  );
}
