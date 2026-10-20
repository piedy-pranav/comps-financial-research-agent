import type { Metadata } from "next";
import Link from "next/link";
import { AgentTrace } from "@/components/agent-trace";
import { AnswerView } from "@/components/answer-view";
import { SavedTime } from "@/components/history/saved-time";
import { AppShell } from "@/components/layout/app-shell";
import { StatePanel } from "@/components/research/state-panel";
import { getHistoryRun } from "@/lib/history";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Saved research · Comps" };

const linkClass = "text-[13px] text-ink-3 transition-colors duration-150 hover:text-ink";

// Reopens one saved run from `runs.trace`. Pure read: no agent, SEC, Tavily, usage or new run row.
export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);
  const result = user ? await getHistoryRun(user.id, id) : ({ state: "error" } as const);

  return (
    <AppShell section="History" requireUser>
      <div className="mx-auto w-full max-w-(--answer-max) flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        <Link href="/history" className={linkClass}>
          &larr; History
        </Link>

        {result.state === "ok" ? (
          <>
            <header className="mt-5">
              <p className="text-xs font-medium uppercase tracking-wider text-ink-3">Research</p>
              <h1 className="mt-2 text-balance text-2xl font-medium leading-snug text-ink [overflow-wrap:anywhere] sm:text-[28px]">
                {result.run.question}
              </h1>
              <SavedTime iso={result.run.createdAt} className="mt-2 block text-xs text-ink-4" />
            </header>
            <AgentTrace steps={result.run.run.steps} loading={false} />
            <AnswerView result={{ status: "success", answer: result.run.run.answer, trace: result.run.run.steps }} />
          </>
        ) : (
          <div className="mt-8">
            {result.state === "missing" ? (
              <StatePanel title="Research not found">
                <p>This research may no longer be available.</p>
              </StatePanel>
            ) : (
              <StatePanel tone="error" title="We couldn't load this research.">
                <p>Please try again in a moment.</p>
              </StatePanel>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
