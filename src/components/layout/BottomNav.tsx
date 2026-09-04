"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS } from "./tabs";

/**
 * Navigazione: sidebar fissa a sinistra su desktop (lg+). Su mobile vedi FloatingNav.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:h-dvh lg:w-60 lg:flex-col lg:border-r lg:border-border lg:bg-surface lg:backdrop-blur">
      <div className="px-6 pb-6 pt-8">
        <Link href="/" className="text-2xl font-extrabold tracking-tight">
          Zapp<span className="text-accent">.</span>
        </Link>
      </div>
      <div className="flex flex-col gap-1 px-3">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href ||
            (tab.href !== "/" && pathname.startsWith(`${tab.href}/`));
          const classes = `flex flex-row items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
            active
              ? "bg-accent/10 text-accent"
              : "text-muted hover:bg-surface-2 hover:text-text"
          }`;
          return (
            <Link key={tab.label} href={tab.href} className={classes}>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="size-5"
              >
                {tab.icon}
              </svg>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
