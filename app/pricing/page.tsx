import type { Metadata } from "next";
import Link from "next/link";
import { FREE_QUESTION_LIMIT, PRO_DAILY_LIMIT, PRO_PRICE_USD } from "@/lib/plans";

export const metadata: Metadata = { title: "Pricing · Comps" };

// Plans from docs/PRD.md. Stripe checkout and the "You're on Pro" state come later.
export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-2 text-slate-500">Cited peer benchmarks from SEC filings, without the enterprise price tag.</p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        <PlanCard
          name="Free"
          price="$0"
          description="Try it out."
          features={[`${FREE_QUESTION_LIMIT} questions`, "Cited answers from SEC filings", "Visible reasoning trace"]}
        >
          <Link
            href="/signup"
            className="block w-full rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Start free
          </Link>
        </PlanCard>

        <PlanCard
          name="Pro"
          price={`$${PRO_PRICE_USD}`}
          priceNote="one-time"
          description="For regular research."
          features={[`Up to ${PRO_DAILY_LIMIT} questions a day`, "Everything in Free"]}
          highlighted
        >
          {/* TODO(Steps 4–5): replace with a button that POSTs to /api/checkout. */}
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white opacity-50"
          >
            Coming soon
          </button>
        </PlanCard>

        <PlanCard
          name="Team"
          price="Custom"
          description="For corporate analyst teams."
          features={["Higher limits", "Multiple seats", "Shared workspace"]}
        >
          {/* TODO(Steps 4–5): point this at the team's contact channel. */}
          <button
            type="button"
            className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Contact us
          </button>
        </PlanCard>
      </div>
    </main>
  );
}

function PlanCard({
  name,
  price,
  priceNote,
  description,
  features,
  highlighted = false,
  children,
}: {
  name: string;
  price: string;
  priceNote?: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border bg-white p-6 shadow-sm ${
        highlighted ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"
      }`}
    >
      <h2 className="text-lg font-semibold">{name}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <p className="mt-4">
        <span className="text-3xl font-semibold">{price}</span>
        {priceNote && <span className="ml-1 text-sm text-slate-500">{priceNote}</span>}
      </p>
      <ul className="mt-6 flex-1 space-y-2 text-sm text-slate-700">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <span aria-hidden className="text-emerald-600">✓</span>
            {feature}
          </li>
        ))}
      </ul>
      <div className="mt-6">{children}</div>
    </div>
  );
}
