import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { type Plan } from "@/lib/plans";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

// Sidebar + top bar + content area for the signed-in app and the public pricing page.
export async function AppShell({
  section,
  requireUser = false,
  children,
}: {
  section: string;
  requireUser?: boolean; // proxy.ts already redirects logged-out users; this is the server-side backstop
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user && requireUser) redirect("/login");

  let plan: Plan | null = null;
  if (user) {
    const supabase = await createClient();
    const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle();
    plan = profile?.plan === "pro" ? "pro" : "free";
  }

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-raised focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar section={section} user={user} plan={plan} />
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
