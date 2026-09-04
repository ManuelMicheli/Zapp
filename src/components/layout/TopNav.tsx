"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TABS } from "./tabs";

/**
 * Navigazione desktop (lg+): barra fissa in alto, trasparente sopra i contenuti.
 * Wordmark a sinistra, pillola centrale con indicatore che scorre tra le voci,
 * azioni a destra (`right`, es. campanella notifiche: server component passato dal layout).
 * Dopo qualche pixel di scroll compare un velo scuro sfumato per la leggibilità.
 * Su mobile vedi FloatingNav.
 */
export function TopNav({ right }: { right?: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 hidden lg:block">
      {/* velo: solo quando la pagina è scrollata, sfuma verso il basso senza bordi netti */}
      <div
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/85 via-black/45 to-transparent transition-opacity duration-500 ${
          scrolled ? "opacity-100" : "opacity-0"
        }`}
      />
      <nav
        aria-label="Navigazione principale"
        className="pointer-events-auto relative grid h-[72px] grid-cols-[1fr_auto_1fr] items-center px-10"
      >
        <Link
          href="/"
          className="w-fit text-[22px] font-extrabold leading-none tracking-[-0.04em] text-text"
        >
          Zapp<span className="text-accent">.</span>
        </Link>

        <ul
          className={`flex items-center gap-0.5 rounded-full border p-1 transition-[background-color,border-color,box-shadow] duration-500 ${
            scrolled
              ? "border-white/[0.1] bg-[rgba(20,20,24,0.7)] shadow-[0_10px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl"
              : "border-white/[0.08] bg-white/[0.05] backdrop-blur-xl"
          }`}
        >
          {TABS.map((tab) => {
            const active =
              pathname === tab.href ||
              (tab.href !== "/" && pathname.startsWith(`${tab.href}/`));
            return (
              <li key={tab.href} className="relative">
                {active && (
                  <motion.span
                    layoutId="topnav-active"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 420, damping: 38, mass: 0.8 }
                    }
                  />
                )}
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-9 items-center rounded-full px-4 text-[13.5px] font-medium tracking-[-0.01em] transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    active ? "text-text" : "text-white/55 hover:text-white/90"
                  }`}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-end gap-2">{right}</div>
      </nav>
    </header>
  );
}
