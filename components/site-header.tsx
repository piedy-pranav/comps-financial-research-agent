import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
          Comps
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-slate-600 hover:text-slate-900">
            Pricing
          </Link>
          {user ? (
            <>
              <span className="hidden max-w-48 truncate text-slate-500 sm:inline">
                {user.email}
              </span>
              <LogoutButton />
            </>
          ) : (
            <Link href="/login" className="text-slate-600 hover:text-slate-900">
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
