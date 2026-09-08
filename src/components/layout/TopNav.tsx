"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TABS } from "./tabs";

/**
 * Navigazione unica, trasparente sopra i contenuti (schermo pieno): fissa in basso
 * sotto lg (telefono/tablet, come una tab bar), in alto da lg. Stessa struttura a tutte
 * le larghezze: pillola centrale con indicatore che scorre tra le voci (icone del set del
 * marchio su mobile, etichette da lg; nessun wordmark, la Z del logo è la voce Home,
 * che sta al centro delle cinque voci — vedi `tabs.tsx` per l'ordine).
 * Le azioni (`right`, es. campanella notifiche: server component passato dal layout)
 * stanno in un elemento fisso **fuori dalla barra**, montato una sola volta (la
 * campanella fa una query: mai renderla due volte): in alto a destra sotto `lg`, dove la
 * nav è in basso, e all'angolo destro della nav da `lg`. Sotto `lg` sparisce dove la
 * pagina possiede già quell'angolo (scheda titolo/stagione: audio + Condividi; profilo:
 * modifica). Rispetta la safe area iOS.
 * Velo scuro sfumato per la leggibilità: sempre in basso (il contenuto ci passa sotto
 * a ogni scroll), da lg solo dopo qualche pixel di scroll. Le pagine si tengono a
 * distanza con `--nav-top` / `--nav-bottom` (globals.css); `PageShell` riserva lo
 * spazio in basso.
 */
export function TopNav({ right }: { right?: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  // sotto lg l'angolo in alto a destra è già occupato dai comandi della pagina
  // (scheda titolo: audio + Condividi; profilo: modifica; profilo altrui: "Altre azioni")
  const cornerTaken =
    pathname.startsWith("/title/") ||
    pathname.startsWith("/u/") ||
    pathname === "/profile" ||
    pathname === "/notifications";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom,0px)] lg:bottom-auto lg:top-0 lg:pb-0 lg:pt-[env(safe-area-inset-top,0px)]">
      {/* velo: sfuma verso il contenuto senza bordi netti (sempre in basso; da lg solo dopo lo scroll) */}
      <div
        aria-hidden="true"
        className={`absolute inset-x-0 bottom-0 h-[calc(env(safe-area-inset-bottom,0px)+128px)] bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-500 lg:bottom-auto lg:top-0 lg:h-[calc(env(safe-area-inset-top,0px)+128px)] lg:bg-gradient-to-b ${
          scrolled ? "opacity-100" : "opacity-100 lg:opacity-0"
        }`}
      />
      <nav
        aria-label="Navigazione principale"
        // Sul telefono la pillola è larga quanto la pagina (stesso gutter di
        // `PageShell`, px-3 sotto 380px) e le cinque voci si dividono lo spazio: le due
        // esterne arrivano ai bordi (richiesta utente 2026-09-08). Da `md` (tablet) la
        // pillola torna della sua larghezza, centrata: distesa su 728px sarebbe una
        // barra vuota con cinque icone perse dentro. Da `lg` la griglia a tre colonne.
        className="pointer-events-auto relative flex h-[84px] items-center justify-center px-3 min-[380px]:px-5 md:px-8 lg:grid lg:h-[72px] lg:grid-cols-[1fr_auto_1fr] lg:px-10"
      >
        {/* colonna sinistra vuota: tiene la pillola centrata (nessun wordmark, il logo è la Z in nav) */}
        <div aria-hidden="true" className="hidden lg:block" />

        <ul
          className={`flex w-full items-center justify-between gap-0.5 rounded-full border p-1 transition-[background-color,border-color,box-shadow] duration-500 md:w-auto md:justify-start lg:p-1.5 ${
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
              <li key={tab.href} className="relative flex-1 md:flex-none">
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
                  // prefetch pieno (anche i dati dinamici): le voci si aprono dalla
                  // cache. Cinema no: `undefined` = solo il `loading.tsx`, così la
                  // programmazione non gira sul server a ogni pagina (vedi tabs.tsx)
                  prefetch={tab.prefetchFull ? true : undefined}
                  aria-label={tab.label}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-12 w-full items-center justify-center rounded-full text-[13.5px] font-medium tracking-[-0.01em] transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:w-12 lg:h-9 lg:w-auto lg:px-4 ${
                    active ? "text-text" : "text-white/55 hover:text-white/90"
                  }`}
                >
                  {/* icona del set del marchio come maschera: prende currentColor,
                      quindi segue lo stato attivo. Solo mobile, da lg c'è l'etichetta. */}
                  <span
                    aria-hidden="true"
                    className="h-[25px] w-[25px] bg-current lg:hidden"
                    style={{
                      maskImage: `url(${tab.icon})`,
                      WebkitMaskImage: `url(${tab.icon})`,
                      maskSize: "contain",
                      WebkitMaskSize: "contain",
                      maskRepeat: "no-repeat",
                      WebkitMaskRepeat: "no-repeat",
                      maskPosition: "center",
                      WebkitMaskPosition: "center",
                    }}
                  />
                  <span className="hidden lg:inline">{tab.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* colonna destra vuota: le azioni sono l'elemento fisso qui sotto */}
        <div aria-hidden="true" className="hidden lg:block" />
      </nav>

      {right && (
        <div
          className={`pointer-events-auto fixed right-5 top-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] z-30 flex items-center gap-2 lg:right-10 lg:top-[calc(env(safe-area-inset-top,0px)+16px)] ${
            cornerTaken ? "hidden lg:flex" : ""
          }`}
        >
          {right}
        </div>
      )}
    </header>
  );
}
