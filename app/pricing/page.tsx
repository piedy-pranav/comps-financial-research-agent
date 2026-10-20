import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { CheckIcon } from "@/components/ui/icons";
import { FREE_QUESTION_LIMIT, PRO_DAILY_LIMIT, PRO_PRICE_USD } from "@/lib/plans";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pricing · Comps" };

const secondaryButton =
  "block w-full rounded-md border border-line px-4 py-2 text-center text-[13px] font-medium text-ink-2 transition-colors duration-150 hover:border-line-strong hover:bg-subtle hover:text-ink";
const disabledButton =
  "block w-full cursor-not-allowed rounded-md border border-line-subtle bg-subtle px-4 py-2 text-center text-[13px] font-medium text-ink-4";

// Visual shell for Step 3: plans from docs/PRD.md. Payments are not wired yet, so Pro and Team stay unhooked.
export default async function PricingPage() {
  const user = await getCurrentUser();

  return (
    <AppShell section="Pricing">
      <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="max-w-xl">
          <h1 className="text-2xl font-medium text-ink sm:text-[28px]">Simple research access</h1>
          <p className="mt-2 text-[15px] leading-6 text-ink-3">
            Cited peer benchmarks from SEC filings, without the enterprise price tag.
          </p>
        </header>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <PlanCard
            name="Free"
            price="$0"
            blurb="Try it out."
            features={[`${FREE_QUESTION_LIMIT} research questions`, "Cited answers from SEC filings", "Visible research trace"]}
          >
            <Link href={user ? "/" : "/signup"} className={secondaryButton}>
              {user ? "Ask a question" : "Start free"}
            </Link>
          </PlanCard>

          <PlanCard
            name="Pro"
            price={`$${PRO_PRICE_USD}`}
            priceNote="one-time"
            blurb="For regular research."
            features={[`${PRO_DAILY_LIMIT} questions a day`, "Everything in Free"]}
            recommended
          >
            {/* Step 3 replaces this with a button that POSTs to /api/checkout. */}
            <button type="button" disabled className={disabledButton}>
              Upgrade to Pro
            </button>
            <p className="mt-2 text-center text-xs text-ink-4">Payments aren&rsquo;t enabled yet.</p>
          </PlanCard>

          <PlanCard
            name="Team"
            price="Contact us"
            blurb="Built for analyst teams."
            features={["Higher limits", "Multiple seats", "Shared workspace"]}
          >
            <button type="button" disabled className={disabledButton}>
              Contact us
            </button>
            <p className="mt-2 text-center text-xs text-ink-4">Team plans aren&rsquo;t available yet.</p>
          </PlanCard>
        </div>
      </div>
    </AppShell>
  );
}

function PlanCard({
  name,
  price,
  priceNote,
  blurb,
  features,
  recommended = false,
  children,
}: {
  name: string;
  price: string;
  priceNote?: string;
  blurb: string;
  features: string[];
  recommended?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`plan-${name}`}
      className={`flex flex-col rounded-lg border bg-raised p-5 ${recommended ? "border-line-strong" : "border-line"}`}
    >
      <div className="flex items-center justify-between">
        <h2 id={`plan-${name}`} className="text-[15px] font-medium text-ink">
          {name}
        </h2>
        {recommended && (
          <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-accent">Recommended</span>
        )}
      </div>
      <p className="mt-1 text-[13px] text-ink-3">{blurb}</p>
      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="text-2xl font-medium text-ink">{price}</span>
        {priceNote && <span className="text-[13px] text-ink-3">{priceNote}</span>}
      </p>
      <ul className="mt-5 flex-1 space-y-2.5 text-[13px] text-ink-2">
        {features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <CheckIcon size={14} className="mt-0.5 shrink-0 text-accent" />
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-6">{children}</div>
    </section>
  );
}
