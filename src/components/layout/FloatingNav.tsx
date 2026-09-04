"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS } from "./tabs";

/**
 * Barra di navigazione flottante in vetro, solo mobile.
 */
export function FloatingNav() {
  const pathname = usePathname();
  // sulla scheda titolo la barra azioni prende il posto della nav
  if (pathname.startsWith("/title/")) return null;
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-[140px] bg-gradient-to-b from-transparent via-black/85 to-black lg:hidden" />
      <nav
        className="glass-strong fixed inset-x-4 z-30 mx-auto flex h-16 max-w-[448px] items-center justify-between rounded-full px-1.5 lg:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)" }}
      >
        {TABS.map((tab) => {
          const active =
            pathname === tab.href ||
            (tab.href !== "/" && pathname.startsWith(`${tab.href}/`));
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`flex h-[52px] w-[62px] flex-col items-center justify-center gap-[3px] rounded-full text-[10px] font-medium ${
                active ? "bg-accent/[0.22] text-accent-pale" : "text-muted"
              }`}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {tab.icon}
              </svg>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
