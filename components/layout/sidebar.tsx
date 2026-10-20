"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { HistoryIcon, PlusIcon, SidebarIcon, TagIcon } from "@/components/ui/icons";
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

// Expanded (icons + labels) by default; the toggle collapses it to the icon rail. The choice is remembered per browser.
const COLLAPSE_KEY = "comps:sidebar-collapsed";
const COLLAPSE_EVENT = "comps:sidebar-toggle";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeCollapsed(cb: () => void) {
  window.addEventListener(COLLAPSE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function useCollapsed() {
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const toggle = () => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    } catch {
      // Storage blocked: the toggle just won't persist.
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  };
  return { collapsed, toggle };
}

const rowClass = (active: boolean, collapsed: boolean) =>
  `flex h-10 items-center rounded-md text-[14px] transition-colors duration-150 ${
    collapsed ? "w-10 justify-center" : "w-full gap-3 px-3"
  } ${active ? "bg-hover text-ink" : "text-ink-3 hover:bg-subtle hover:text-ink"}`;

// Desktop sidebar. Only real destinations: no placeholders.
export function Sidebar() {
  const { pathname, newQuestion } = useNav();
  const { collapsed, toggle } = useCollapsed();
  const items = [
    { href: "/history", label: "History", icon: <HistoryIcon size={18} /> },
    { href: "/pricing", label: "Pricing", icon: <TagIcon size={18} /> },
  ];
  return (
    <aside
      className={`sticky top-0 hidden h-dvh shrink-0 flex-col gap-1 border-r border-line-subtle bg-[#111110] py-3 md:flex ${
        collapsed ? "w-(--sidebar-width) items-center" : "w-(--sidebar-width-open) px-3"
      }`}
    >
      <div className={`mb-3 flex ${collapsed ? "flex-col items-center gap-2" : "items-center justify-between"}`}>
        <Logo />
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink-3 transition-colors duration-150 hover:bg-subtle hover:text-ink"
        >
          <SidebarIcon size={18} />
        </button>
      </div>
      <nav aria-label="Primary" className={`flex flex-col gap-1 ${collapsed ? "items-center" : ""}`}>
        <button
          type="button"
          onClick={newQuestion}
          className={rowClass(pathname === "/", collapsed)}
          aria-label="New question"
          title="New question"
        >
          <PlusIcon size={18} className="shrink-0" />
          {!collapsed && "New question"}
        </button>
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={rowClass(active, collapsed)}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              title={item.label}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          );
        })}
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
        href="/history"
        className={`${itemClass(pathname.startsWith("/history"))} h-9 w-9`}
        aria-label="History"
        aria-current={pathname.startsWith("/history") ? "page" : undefined}
      >
        <HistoryIcon size={18} />
      </Link>
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
