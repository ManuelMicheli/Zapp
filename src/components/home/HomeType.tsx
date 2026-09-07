"use client";

import { motion, useReducedMotion } from "framer-motion";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type HomeType = "movie" | "tv";

const HomeTypeCtx = createContext<{
  type: HomeType;
  setType: (t: HomeType) => void;
} | null>(null);

/**
 * Scelta Film / Serie TV della home: vale per tutta la pagina, non solo per il
 * carosello in testa. Il contesto è client, i dati arrivano già divisi per tipo
 * dai componenti server: cambiare scheda non ricarica nulla.
 */
export function HomeTypeProvider({ children }: { children: ReactNode }) {
  const [type, setType] = useState<HomeType>("movie");
  const value = useMemo(() => ({ type, setType }), [type]);
  return <HomeTypeCtx.Provider value={value}>{children}</HomeTypeCtx.Provider>;
}

export function useHomeType() {
  return useContext(HomeTypeCtx);
}

/**
 * Mostra i figli solo quando la scheda attiva è `type`. Fuori dalla home (Scopri,
 * Cerca) non c'è provider e il gate è trasparente: si vede tutto, come prima.
 */
export function HomeTypeGate({
  type,
  children,
}: {
  type: HomeType;
  children: ReactNode;
}) {
  const ctx = useContext(HomeTypeCtx);
  if (ctx && ctx.type !== type) return null;
  return <>{children}</>;
}

/** Come `HomeTypeGate`, ma con due varianti: senza provider vince `movie`. */
export function HomeTypeSwap({ movie, tv }: { movie: ReactNode; tv: ReactNode }) {
  const ctx = useContext(HomeTypeCtx);
  return <>{!ctx || ctx.type === "movie" ? movie : tv}</>;
}

const TABS: { key: HomeType; label: string }[] = [
  { key: "movie", label: "Film" },
  { key: "tv", label: "Serie TV" },
];

/** Testata della home: "Home" e la pillola Film | Serie TV che filtra la pagina. */
export function HomeTypeSwitch() {
  const reduceMotion = useReducedMotion();
  const ctx = useContext(HomeTypeCtx);
  if (!ctx) return null;

  return (
    <header className="flex items-center justify-between px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
      <h1 className="text-[34px] font-bold leading-none tracking-[-0.045em]">Home</h1>

      <div
        role="tablist"
        aria-label="Film o serie TV"
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
              className={`relative h-8 rounded-full px-4 text-[13px] font-semibold transition-colors ${
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
