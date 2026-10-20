"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PlusIcon, TagIcon } from "@/components/ui/icons";
import { NEW_QUESTION_EVENT } from "./events";

const itemClass = (active: boolean) =>
  `flex h-10 w-10 items-center justify-center rounded-md transition-colors duration-150 ${
    active ? "bg-hover text-ink" : "text-ink-3 hover:bg-subtle hover:text-ink"
  }`;

function useNav() {
  const pathname = usePathname();
  const router = useRouter();
  function newQuestion() {
    if (pathname === "/") window.dispatchEvent(new Event(NEW_QUESTION_EVENT));
    else router.push("/");
  }
  return { pathname, newQuestion };
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Comps home"
      className={`flex h-9 w-9 items-center justify-center rounded-md border border-line bg-raised text-[15px] font-semibold text-ink ${className}`}
    >
      C
    </Link>
  );
}

// Desktop rail. Only real destinations: no History or other placeholders.
export function Sidebar() {
  const { pathname, newQuestion } = useNav();
  return (
    <aside className="sticky top-0 hidden h-dvh w-(--sidebar-width) shrink-0 flex-col items-center gap-1 border-r border-line-subtle bg-[#111110] py-3 md:flex">
      <Logo className="mb-3" />
      <nav aria-label="Primary" className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={newQuestion}
          className={itemClass(pathname === "/")}
          aria-label="New question"
          title="New question"
        >
          <PlusIcon size={18} />
        </button>
        <Link
          href="/pricing"
          className={itemClass(pathname.startsWith("/pricing"))}
          aria-label="Pricing"
          aria-current={pathname.startsWith("/pricing") ? "page" : undefined}
          title="Pricing"
        >
          <TagIcon size={18} />
        </Link>
      </nav>
    </aside>
  );
}

// The rail becomes a compact row in the top bar below the md breakpoint.
export function MobileNav() {
  const { pathname, newQuestion } = useNav();
  return (
    <nav aria-label="Primary" className="flex items-center gap-1 md:hidden">
      <Logo className="mr-1" />
      <button
        type="button"
        onClick={newQuestion}
        className={`${itemClass(pathname === "/")} h-9 w-9`}
        aria-label="New question"
      >
        <PlusIcon size={18} />
      </button>
      <Link
        href="/pricing"
        className={`${itemClass(pathname.startsWith("/pricing"))} h-9 w-9`}
        aria-label="Pricing"
        aria-current={pathname.startsWith("/pricing") ? "page" : undefined}
      >
        <TagIcon size={18} />
      </Link>
    </nav>
  );
}
