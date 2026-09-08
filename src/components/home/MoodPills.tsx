"use client";

import { useCallback, useRef, useState } from "react";
import type { MomentResponse, MomentShelfData } from "@/lib/moment/shelf";
import { HomeTypeGate } from "./HomeType";
import { ItemShelf } from "./ItemShelf";

/**
 * La fila del momento, con le sei pillole del mood sopra.
 *
 * Il mood **non si salva da nessuna parte**: vive quanto la sessione, e alla chiusura
 * dell'app torna il contesto automatico. Un mood di stamattina che ricompare stasera
 * sarebbe peggio di nessun mood.
 *
 * Le risposte restano in una `Map` per sessione: tornare su un mood già visto non
 * costa una seconda chiamata.
 */

const PILL_BASE =
  "h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors disabled:opacity-50";

export function MoodPills({
  titolo,
  eyebrow,
  data,
  moods,
}: {
  titolo: string;
  eyebrow: string | null;
  data: MomentShelfData;
  moods: { key: string; pillola: string }[];
}) {
  const [attivo, setAttivo] = useState<string | null>(null);
  const [caricando, setCaricando] = useState<string | null>(null);
  const cache = useRef(new Map<string, MomentResponse>());

  const scegli = useCallback(
    async (key: string) => {
      // secondo tocco sulla stessa pillola: si torna al momento automatico
      if (key === attivo) {
        setAttivo(null);
        return;
      }
      const gia = cache.current.get(key);
      if (gia) {
        setAttivo(key);
        return;
      }
      setCaricando(key);
      try {
        const res = await fetch(`/api/moment?mood=${encodeURIComponent(key)}`);
        if (!res.ok) return;
        const payload = (await res.json()) as MomentResponse;
        cache.current.set(key, payload);
        setAttivo(key);
      } catch {
        // una rete che salta non deve svuotare la fila: resta quella di prima
      } finally {
        setCaricando(null);
      }
    },
    [attivo],
  );

  // `titolo`/`data` sono la copia fresca: il server li ricalcola a ogni
  // `revalidatePath("/")` (ogni azione di watch/actions.ts). Tenerli specchiati in uno
  // stato client li congelava al primo render, perché `MoodPills` non viene mai
  // rimontato: da qui in giù si legge sempre dai prop quando non c'è un mood scelto a
  // mano, e dalla cache solo quando c'è.
  const corrente: MomentResponse = (attivo ? cache.current.get(attivo) : undefined) ?? {
    titolo,
    data,
  };

  const pillole = (
    <div
      className="scrollbar-none -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:px-0"
      role="group"
      aria-label="Come ti senti?"
    >
      {moods.map((m) => {
        const acceso = m.key === attivo;
        return (
          <button
            key={m.key}
            type="button"
            aria-pressed={acceso}
            disabled={caricando !== null}
            onClick={() => scegli(m.key)}
            className={`${PILL_BASE} ${
              acceso
                ? "bg-accent text-black"
                : "glass text-white/80 hover:bg-white/[0.16]"
            }`}
          >
            {caricando === m.key ? "…" : m.pillola}
          </button>
        );
      })}
    </div>
  );

  // Il sopratitolo racconta il contesto (`Adesso a Milano · piove`): con un mood scelto
  // a mano non c'entra più niente, e sparisce.
  const sopratitolo = attivo ? undefined : (eyebrow ?? undefined);

  return (
    <>
      <HomeTypeGate type="all">
        <ItemShelf
          title={corrente.titolo}
          items={corrente.data.all}
          surface="home-momento"
          eyebrow={sopratitolo}
          aside={pillole}
        />
      </HomeTypeGate>
      <HomeTypeGate type="movie">
        <ItemShelf
          title={corrente.titolo}
          items={corrente.data.movie}
          surface="home-momento"
          eyebrow={sopratitolo}
          aside={pillole}
        />
      </HomeTypeGate>
      <HomeTypeGate type="tv">
        <ItemShelf
          title={corrente.titolo}
          items={corrente.data.tv}
          surface="home-momento"
          eyebrow={sopratitolo}
          aside={pillole}
        />
      </HomeTypeGate>
    </>
  );
}
