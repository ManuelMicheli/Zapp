"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import type { DayOption } from "@/lib/cinema/dates";

/** Pillola dei 7 giorni: cambia `?day=` mantenendo gli altri parametri. */
export function DayBar({ days, selected }: { days: DayOption[]; selected: string }) {
  const pathname = usePathname();
  const params = useSearchParams();

  function hrefFor(date: string): string {
    const next = new URLSearchParams(params.toString());
    next.set("day", date);
    return `${pathname}?${next.toString()}`;
  }

  return (
    <div className="scrollbar-none -mx-5 flex gap-1 overflow-x-auto px-5 md:mx-0 md:px-0">
      <div className="glass flex shrink-0 rounded-full p-1">
        {days.map((d) => {
          const active = d.date === selected;
          return (
            <Link
              key={d.date}
              href={hrefFor(d.date)}
              scroll={false}
              className={`relative rounded-full px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap ${
                active ? "text-white" : "text-muted"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="daybar-indicator"
                  className="absolute inset-0 rounded-full bg-accent"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <span className="relative">{d.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
