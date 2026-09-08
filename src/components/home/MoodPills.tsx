"use client";

import { useCallback, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toaster";
import type { ShelfItem } from "@/lib/home/shelves-rank";
import type { MomentResponse, MomentShelfData, MomentTitoli } from "@/lib/moment/shelf";
import { signalAttr } from "@/lib/taste/surfaces";
import { BannerCarousel, type BannerItem } from "./BannerCarousel";
import { HomeTypeGate } from "./HomeType";

/**
 * La fila del momento, con le sei pillole del mood sopra. È un **banner come il
 * carosello in testa alla home** (scelta utente 2026-09-08): un titolo alla volta col
 * suo fondale, non uno scaffale di copertine.
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
  titoli,
  data,
  moods,
  conSchede = true,
}: {
  titoli: MomentTitoli;
  data: MomentShelfData;
  moods: { key: string; pillola: string }[];
  /**
   * `false` fuori dalla home. `HomeTypeGate` filtra **solo** dentro
   * `HomeTypeProvider`: senza provider lascia passare tutto, quindi in Cerca le tre
   * varianti si sarebbero disegnate una sotto l'altra, tre file identiche.
   */
  conSchede?: boolean;
}) {
  const [attivo, setAttivo] = useState<string | null>(null);
  const [caricando, setCaricando] = useState<string | null>(null);
  const { show } = useToast();
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
        // Una pillola che non fa niente sembra rotta: senza questo avviso, un 429 (il
        // limite per utente) lasciava la fila com'era e il tocco pareva ignorato.
        if (!res.ok) {
          show(
            res.status === 429
              ? "Troppi cambi di seguito, riprova fra un minuto"
              : "Non è riuscito, riprova",
          );
          return;
        }
        const payload = (await res.json()) as MomentResponse;
        cache.current.set(key, payload);
        setAttivo(key);
      } catch {
        // una rete che salta non deve svuotare la fila: resta quella di prima
        show("Non è riuscito, riprova");
      } finally {
        setCaricando(null);
      }
    },
    [attivo, show],
  );

  // `titolo`/`data` sono la copia fresca: il server li ricalcola a ogni
  // `revalidatePath("/")` (ogni azione di watch/actions.ts). Tenerli specchiati in uno
  // stato client li congelava al primo render, perché `MoodPills` non viene mai
  // rimontato: da qui in giù si legge sempre dai prop quando non c'è un mood scelto a
  // mano, e dalla cache solo quando c'è.
  const corrente: MomentResponse = (attivo ? cache.current.get(attivo) : undefined) ?? {
    titoli,
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

  /** Testata della fila: titolo e pillole, sopra il banner. */
  const testata = (titolo: string) => (
    <>
      <h2 className="text-xl font-bold tracking-[-0.03em]">{titolo}</h2>
      {pillole}
    </>
  );

  const banner = (titolo: string, items: ShelfItem[]) => (
    <BannerCarousel
      items={items.map(toBanner)}
      label={titolo}
      header={testata(titolo)}
      resetKey={attivo ?? "auto"}
    />
  );

  if (!conSchede) return banner(corrente.titoli.all, corrente.data.all);

  return (
    <>
      <HomeTypeGate type="all">
        {banner(corrente.titoli.all, corrente.data.all)}
      </HomeTypeGate>
      <HomeTypeGate type="movie">
        {banner(corrente.titoli.movie, corrente.data.movie)}
      </HomeTypeGate>
      <HomeTypeGate type="tv">
        {banner(corrente.titoli.tv, corrente.data.tv)}
      </HomeTypeGate>
    </>
  );
}

/** Da titolo della fila a card del banner: la pillola dice l'affinità, se c'è. */
function toBanner(item: ShelfItem, i: number): BannerItem {
  return {
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    overview: item.overview,
    year: item.year,
    voteAverage: item.rating,
    chip: item.affinity != null ? `Per te ${item.affinity}%` : null,
    signal: signalAttr(item.mediaType, item.id, "home-momento", i),
  };
}
