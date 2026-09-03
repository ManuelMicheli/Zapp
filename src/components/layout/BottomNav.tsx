"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/",
    label: "Home",
    icon: (
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z" />
    ),
  },
  {
    href: "/search",
    label: "Cerca",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.35-4.35" />
      </>
    ),
  },
  {
    // Amici torna in Fase 4 come quinta tab
    href: "/library",
    label: "Libreria",
    icon: (
      <>
        <path d="M4 5a1 1 0 0 1 1-1h3v16H5a1 1 0 0 1-1-1V5Z" />
        <path d="M10 4h4v16h-4z" />
        <path d="m16.5 4.6 3.9 1a1 1 0 0 1 .7 1.2L17.8 20l-3.9-1 3.6-14.4Z" />
      </>
    ),
  },
  {
    href: "/profile",
    label: "Profilo",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
      </>
    ),
  },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[480px] border-t border-border bg-surface/95 backdrop-blur">
      <div className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href ||
            (tab.href !== "/" && pathname.startsWith(`${tab.href}/`));
          const classes = `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
            active ? "text-accent" : "text-muted"
          }`;
          const icon = (
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
            >
              {tab.icon}
            </svg>
          );

          return (
            <Link key={tab.label} href={tab.href} className={classes}>
              {icon}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
