import { redirect } from "next/navigation";
import { AskForm } from "@/components/ask-form";
import { planLabel, type Plan } from "@/lib/plans";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export default async function Home() {
  // proxy.ts already redirects logged-out users; this is the server-side backstop.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();
  const plan: Plan = profile?.plan === "pro" ? "pro" : "free";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ask Comps</h1>
          <p className="mt-1 text-sm text-slate-500">
            Compare a company against its peers, with every number pulled from SEC filings.
          </p>
        </div>
        <span
          className={
            plan === "pro"
              ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800"
              : "rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700"
          }
        >
          {planLabel(plan)}
        </span>
      </div>

      <AskForm />
    </main>
  );
}
