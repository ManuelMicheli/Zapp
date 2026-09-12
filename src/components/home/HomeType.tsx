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

/**
 * "Home" in testa alla pagina, alto 40px e a 20px dal bordo come le due icone fisse di
 * `TopNav` (size-10, right-5, safe+20): stanno sulla stessa linea e ai due margini.
 *
 * La scritta sta **sull'immagine** a tutte le larghezze: il banner risale sotto di lei
 * col margine negativo di `HOME_BANNER_TOP` e il velo in cima lo tiene leggibile
 * (richiesta utente 2026-09-12). Sotto `lg` la nav è in basso e la cima è libera; da
 * `lg` la nav è in alto e ci sta sopra anche lei, in trasparenza.
 */
export function HomeTitle() {
  return (
    // `relative z-20`: sotto `lg` il banner risale **sopra** questa riga con un margine
    // negativo, e venendo dopo nel DOM le dipingeva addosso — la scritta c'era, nei
    // riquadri, ma non si vedeva
    <header className="relative z-20 px-5 pb-3 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:px-10 lg:pb-4 lg:pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)]">
      <h1 className="flex h-10 items-center text-[34px] font-bold leading-none tracking-[-0.045em] lg:h-auto lg:text-[40px]">
        Home
      </h1>
    </header>
  );
}

/**
 * La pillola Tutto / Film / Serie TV che filtra la pagina. Sta **sotto il banner**,
 * insieme alle pillole dei generi: sul fondale restano solo la nav e le sue icone
 * (richiesta utente 2026-09-12). Larga tutta la riga sul telefono, così "Serie TV" non
 * va mai a capo; da `lg` della sua larghezza e **centrata**.
 */
export function HomeTypeSwitch() {
  const reduceMotion = useReducedMotion();
  const ctx = useContext(HomeTypeCtx);
  if (!ctx) return null;

  return (
    // `flex`: senza, da `lg` il `w-auto` della pillola non stringe — un `div` a blocco
    // riempie la riga e la pillola si stirava da un bordo all'altro
    <div className="flex justify-center px-5 lg:px-10">
      <div
        role="tablist"
        aria-label="Tutto, film o serie TV"
        className="glass flex h-10 w-full items-center rounded-full p-1 lg:w-auto"
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
              className={`relative h-8 flex-1 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors lg:flex-none lg:px-4 ${
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
    </div>
  );
}
