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
 * "Home" in testa alla pagina, sopra la scritta sta sempre la pillola Tutto / Film /
 * Serie TV: sotto `lg` perché la nav è in basso e non le sta vicina, da `lg` perché sta
 * appena sotto la barra di `TopNav` (in alto), non più in fondo al banner coi generi
 * (richiesta utente 2026-09-12). La scritta resta alta 40px e a 20px dal bordo come le
 * due icone fisse di `TopNav` (size-10, right-5, safe+20): stanno sulla stessa linea e
 * ai due margini.
 *
 * Tutto sta **sull'immagine**: il banner risale sotto col margine negativo di
 * `HOME_BANNER_TOP` e il velo in cima lo tiene leggibile (richiesta utente 2026-09-12).
 * Sotto `lg` la pillola è nella sua forma corta, larga quanto le serve; da `lg` nella
 * forma normale, larga quanto le serve pure lei (non più tutta la riga, qui non c'è più
 * accanto un titolo da cui stare lontana).
 */
export function HomeTitle() {
  return (
    // `relative z-20`: sotto `lg` il banner risale **sopra** questa riga con un margine
    // negativo, e venendo dopo nel DOM le dipingeva addosso — la scritta c'era, nei
    // riquadri, ma non si vedeva
    <header className="relative z-20 px-5 pb-3 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:px-10 lg:pb-4 lg:pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)]">
      <div className="mb-2 lg:hidden">
        <HomeTypeSwitch corta />
      </div>
      <h1 className="flex h-10 items-center text-[34px] font-bold leading-none tracking-[-0.045em] lg:h-auto lg:text-[40px]">
        Home
      </h1>
      <div className="mt-3 hidden lg:block">
        <HomeTypeSwitch />
      </div>
    </header>
  );
}

/**
 * La pillola Tutto / Film / Serie TV che filtra la pagina. Due forme, una sola per
 * schermata (l'altra è nascosta, vedi `HomeTitle` e la home):
 *
 * - **corta**: sul telefono, in alto **sull'immagine** sotto "Home". Larga quanto le
 *   serve e non tutta la riga, così copre il meno possibile del fondale;
 * - **normale**: da `lg`, sotto il banner e centrata, insieme alle pillole dei generi.
 *
 * `layoutId` diverso per le due: sono due `motion.span` vivi nello stesso momento, e con
 * lo stesso id Framer li animerebbe uno verso l'altro.
 */
export function HomeTypeSwitch({ corta = false }: { corta?: boolean } = {}) {
  const reduceMotion = useReducedMotion();
  const ctx = useContext(HomeTypeCtx);
  if (!ctx) return null;

  return (
    // `flex`: senza, da `lg` il `w-auto` della pillola non stringe — un `div` a blocco
    // riempie la riga e la pillola si stirava da un bordo all'altro
    <div className={corta ? "flex" : "flex justify-center px-5 lg:px-10"}>
      <div
        role="tablist"
        aria-label="Tutto, film o serie TV"
        className={`glass flex items-center rounded-full p-1 ${
          corta ? "h-9 w-fit" : "h-10 w-full lg:w-auto"
        }`}
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
              className={`relative whitespace-nowrap rounded-full font-semibold transition-colors ${
                corta
                  ? "h-7 px-3 text-[12.5px]"
                  : "h-8 flex-1 px-3.5 text-[13px] lg:flex-none lg:px-4"
              } ${active ? "text-white" : "text-white/60 hover:text-white/85"}`}
            >
              {active && (
                <motion.span
                  layoutId={corta ? "home-hero-tab-corta" : "home-hero-tab"}
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
