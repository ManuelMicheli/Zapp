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
    href: "/friends",
    label: "Amici",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
        <circle cx="17.5" cy="9" r="2.5" />
        <path d="M16 14.2c3 .3 5.5 2.4 5.5 5.3" />
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

/**
 * Navigazione: bottom bar su mobile, sidebar fissa a sinistra su desktop (lg+).
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[480px] border-t border-border bg-surface/95 backdrop-blur lg:inset-y-0 lg:left-0 lg:right-auto lg:h-dvh lg:w-60 lg:max-w-none lg:border-r lg:border-t-0 lg:bg-surface">
      <div className="hidden px-6 pb-6 pt-8 lg:block">
        <Link href="/" className="text-2xl font-extrabold tracking-tight">
          Zapp<span className="text-accent">.</span>
        </Link>
      </div>
      <div className="grid grid-cols-5 lg:flex lg:flex-col lg:gap-1 lg:px-3">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href ||
            (tab.href !== "/" && pathname.startsWith(`${tab.href}/`));
          const classes = `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium lg:flex-row lg:gap-3 lg:rounded-xl lg:px-4 lg:py-3 lg:text-sm ${
            active
              ? "text-accent lg:bg-accent/10"
              : "text-muted lg:hover:bg-surface-2 lg:hover:text-text"
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
                className="lg:size-5"
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
