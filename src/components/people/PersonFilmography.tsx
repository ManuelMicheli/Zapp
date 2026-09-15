"use client";

import { useState } from "react";
import {
  POSTER_GRID_DESKTOP,
  POSTER_GRID_SIZES,
  PosterCard,
} from "@/components/ui/PosterCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CreditoPersona } from "@/lib/people/filmography";

/**
 * Filmografia con le pillole Tutto / Film / Serie TV, le stesse della home. Filtra in
 * locale: i crediti arrivano gia' tutti dal server, cambiare pillola non ricarica
 * nulla.
 */

/**
 * Un credito con ZappScore e voto personale gia' attaccati dal server
 * (`getRatings` + `conoscenzaDi`, entrambi calcolati una volta sola dalla pagina).
 * Senza questo, la griglia mostrerebbe il voto TMDB grezzo: l'unica dell'app a farlo.
 */
export type CreditoConVoti = CreditoPersona & {
  zappScore: number | null;
  zappVotes: number;
  userRating: number | null;
};

type Scheda = "all" | "movie" | "tv";

const SCHEDE: { key: Scheda; label: string }[] = [
  { key: "all", label: "Tutto" },
  { key: "movie", label: "Film" },
  { key: "tv", label: "Serie TV" },
];

const GRID = `grid grid-cols-3 gap-4 md:grid-cols-4 ${POSTER_GRID_DESKTOP}`;

export function PersonFilmography({
  sezioni,
}: {
  /** Una o due sezioni: "Come interprete", "Come regista". */
  sezioni: { titolo: string; crediti: CreditoConVoti[] }[];
}) {
  const [scheda, setScheda] = useState<Scheda>("all");
  const filtra = (c: CreditoConVoti[]) =>
    scheda === "all" ? c : c.filter((x) => x.mediaType === scheda);

  const vuoto = sezioni.every((s) => filtra(s.crediti).length === 0);

  return (
    <div className="flex flex-col gap-6 px-5 lg:px-10">
      <div
        role="tablist"
        aria-label="Tutto, film o serie TV"
        className="glass flex h-10 w-full items-center rounded-full p-1 lg:w-auto lg:self-start"
      >
        {SCHEDE.map((s) => {
          const attiva = s.key === scheda;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={attiva}
              onClick={() => setScheda(s.key)}
              className={`h-8 flex-1 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors lg:flex-none lg:px-4 ${
                attiva ? "bg-white/[0.16] text-white" : "text-white/60"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {vuoto && (
        <EmptyState
          title="Niente da mostrare"
          description="Con questo filtro non resta nessun titolo."
        />
      )}

      {sezioni.map((sezione) => {
        const crediti = filtra(sezione.crediti);
        if (crediti.length === 0) return null;
        return (
          <section key={sezione.titolo} className="flex flex-col gap-3.5">
            {sezioni.length > 1 && <h2 className="section-heading">{sezione.titolo}</h2>}
            <div className={GRID}>
              {crediti.map((c, i) => (
                <PosterCard
                  key={`${c.mediaType}-${c.id}`}
                  title={c.title}
                  posterPath={c.posterPath}
                  year={c.year}
                  rating={c.zappScore ?? c.voteAverage ?? undefined}
                  votes={c.zappVotes}
                  userRating={c.userRating}
                  href={`/title/${c.mediaType}/${c.id}`}
                  sizes={POSTER_GRID_SIZES}
                  signal={{ surface: "person", position: i }}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
