"use client";

import { motion, useReducedMotion } from "framer-motion";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** Il tipo di un contenuto: come lo dividono i componenti server. */
export type HomeType = "movie" | "tv";
/** La scheda scelta in testata: i due tipi più "Tutto", che li tiene insieme. */
export type HomeTab = HomeType | "all";

const HomeTypeCtx = createContext<{
  type: HomeTab;
  setType: (t: HomeTab) => void;
} | null>(null);

/**
 * Scelta Tutto / Film / Serie TV della home: vale per tutta la pagina, non solo
 * per il carosello in testa. Il contesto è client, i dati arrivano già divisi per
 * tipo dai componenti server (che rendono anche la variante mista di "Tutto"):
 * cambiare scheda non ricarica nulla.
 */
export function HomeTypeProvider({ children }: { children: ReactNode }) {
  const [type, setType] = useState<HomeTab>("all");
  const value = useMemo(() => ({ type, setType }), [type]);
  return <HomeTypeCtx.Provider value={value}>{children}</HomeTypeCtx.Provider>;
}

export function useHomeType() {
  return useContext(HomeTypeCtx);
}

/**
 * Mostra i figli solo quando la scheda attiva è `type` (o una di `type`, se è un
 * elenco: il cinema, che dà solo film, si vede sia sotto "Film" sia sotto "Tutto").
 * Il confronto è esatto, così chi rende le tre varianti — film, serie e mista — ne
 * mostra sempre una sola. Fuori dalla home (Scopri, Cerca) non c'è provider e il
 * gate è trasparente: si vede tutto, come prima.
 */
export function HomeTypeGate({
  type,
  children,
}: {
  type: HomeTab | HomeTab[];
  children: ReactNode;
}) {
  const ctx = useContext(HomeTypeCtx);
  const tabs = Array.isArray(type) ? type : [type];
  if (ctx && !tabs.includes(ctx.type)) return null;
  return <>{children}</>;
}

/**
 * Come `HomeTypeGate`, ma con le varianti già pronte: senza provider (e sotto
 * "Tutto", se non c'è una variante mista) vince `movie`.
 */
export function HomeTypeSwap({
  movie,
  tv,
  all,
}: {
  movie: ReactNode;
  tv: ReactNode;
  all?: ReactNode;
}) {
  const ctx = useContext(HomeTypeCtx);
  if (!ctx || ctx.type === "movie") return <>{movie}</>;
  if (ctx.type === "tv") return <>{tv}</>;
  return <>{all ?? movie}</>;
}

const TABS: { key: HomeTab; label: string }[] = [
  { key: "all", label: "Tutto" },
  { key: "movie", label: "Film" },
  { key: "tv", label: "Serie TV" },
];

/** Testata della home: "Home" e la pillola Film | Serie TV che filtra la pagina. */
export function HomeTypeSwitch() {
  const reduceMotion = useReducedMotion();
  const ctx = useContext(HomeTypeCtx);
  if (!ctx) return null;

  return (
    /* pr-16 sotto lg: la campanella fissa in alto a destra (TopNav) non deve coprire
       la pillola. Da lg la pillola sta accanto al titolo (`justify-start`): all'estremo
       destro, su un monitor largo, restava orfana a mezzo metro da "Home". */
    <header className="flex items-center justify-between gap-5 pb-4 pl-5 pr-16 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:justify-start lg:gap-7 lg:pl-10 lg:pr-10">
      <h1 className="text-[34px] font-bold leading-none tracking-[-0.045em] lg:text-[40px]">
        Home
      </h1>

      <div
        role="tablist"
        aria-label="Tutto, film o serie TV"
        className="glass flex h-10 items-center rounded-full p-1"
      >
        {TABS.map((t) => {
          const active = t.key === ctx.type;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => ctx.setType(t.key)}
              className={`relative h-8 rounded-full px-3.5 text-[13px] font-semibold transition-colors lg:px-4 ${
                active ? "text-white" : "text-white/60 hover:text-white/85"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="home-hero-tab"
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 420, damping: 38, mass: 0.8 }
                  }
                />
              )}
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
