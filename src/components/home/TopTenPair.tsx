"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState, type ReactNode } from "react";

type TopTenTab = "movie" | "tv";

const TABS: { key: TopTenTab; label: string }[] = [
  { key: "movie", label: "Film" },
  { key: "tv", label: "Serie TV" },
];

/**
 * Fila unica della Top 10 nella scheda "Tutto": Netflix pubblica due classifiche
 * distinte, film e serie (vedi il commento in `TopTen.tsx`), ma impilarle una
 * sopra l'altra non piaceva all'utente. Qui si passa dall'una all'altra con due
 * pillole invece che con due file ferme. `film`/`serie` arrivano già renderizzati
 * dal server (`TopTenCards`, JSX pronto con dati e card): questo componente tiene
 * solo lo stato locale di quale mostrare, senza rendere i dati due volte né
 * rifare la query — lo stesso schema di `HomeTypeGate`/`HomeTypeSwap` in
 * `HomeType.tsx`, applicato qui a un'unica sezione invece che a tutta la pagina.
 *
 * Le pillole riprendono lo stile di `HomeTypeSwitch` (stesso `.glass`, stesso
 * indicatore che scorre) ma in scala ridotta, perché qui vivono dentro
 * l'intestazione di una sezione e non sono la testata della pagina. `layoutId`
 * separato (`"top-ten-tab"` contro `"home-hero-tab"`): le due pillole possono
 * stare montate insieme — questa sezione è dentro la scheda "Tutto", che è anche
 * quella su cui gira `HomeTypeSwitch` — e non devono animarsi a vicenda.
 */
export function TopTenPair({
  heading,
  subheading,
  film,
  serie,
}: {
  heading: string;
  subheading: string;
  film: ReactNode | null;
  serie: ReactNode | null;
}) {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<TopTenTab>("movie");

  const available = TABS.filter((t) => (t.key === "movie" ? film : serie) != null);
  // Con una sola lista disponibile un selettore non ha senso: si mostra quella,
  // anche se lo stato locale è ancora sull'altra (per esempio senza film oggi).
  const activeTab = available.some((t) => t.key === tab) ? tab : available[0]?.key;
  const activeContent = activeTab === "movie" ? film : activeTab === "tv" ? serie : null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 lg:px-10">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.03em]">{heading}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{subheading}</p>
        </div>
        {available.length > 1 && (
          <div
            role="tablist"
            aria-label="Film o serie"
            className="glass flex h-8 shrink-0 items-center rounded-full p-1"
          >
            {available.map((t) => {
              const active = t.key === activeTab;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  className={`relative h-6 whitespace-nowrap rounded-full px-3 text-[12px] font-semibold transition-colors ${
                    active ? "text-white" : "text-white/60 hover:text-white/85"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="top-ten-tab"
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
        )}
      </div>
      {activeContent}
    </section>
  );
}
