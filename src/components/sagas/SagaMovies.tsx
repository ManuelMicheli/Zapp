"use client";

import { useState } from "react";
import { SagaMovieCard } from "@/components/sagas/SagaMovieCard";
import { orderedMovies, type Saga, type SagaOrder } from "@/lib/sagas/order";

export function SagaMovies({
  saga,
  watchedIds,
}: {
  saga: Saga;
  watchedIds: number[] | null;
}) {
  const [order, setOrder] = useState<SagaOrder>("release");
  const [actor, setActor] = useState("Daniel Craig");
  const movies = orderedMovies(saga, order, actor);
  const watched = new Set(watchedIds ?? []);
  const seen = movies.filter((movie) => watched.has(movie.id)).length;
  const modes: { value: SagaOrder; label: string }[] = [
    { value: "release", label: "Per uscita" },
    saga.actors
      ? { value: "actor", label: "Per interprete" }
      : { value: "timeline", label: "Per linea temporale" },
  ];
  const explanation =
    order === "release"
      ? "Segui l'ordine delle prime uscite internazionali: conserva le sorprese e i collegamenti come il pubblico originale."
      : order === "actor"
        ? "Scegli il tuo 007: vedrai solo i suoi film, in ordine di uscita. Craig ha un arco narrativo completo."
        : saga.timelineDescription;

  return (
    <section aria-label="Film della saga">
      <div
        className="flex w-fit max-w-full gap-1 rounded-full p-1 glass"
        role="group"
        aria-label="Ordine dei film"
      >
        {modes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            aria-pressed={order === mode.value}
            aria-controls="saga-movies"
            onClick={() => setOrder(mode.value)}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent ${order === mode.value ? "bg-white/15 text-white" : "text-muted hover:text-text"}`}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted" aria-live="polite">
        {explanation}
      </p>
      {order === "actor" && (
        <div className="mt-5">
          <label htmlFor="bond-actor" className="mb-2 block text-sm font-medium">
            Scegli l’interprete di James Bond
          </label>
          <select
            id="bond-actor"
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            className="min-h-12 w-full rounded-[14px] border border-border bg-surface-2 px-4 text-text sm:w-80"
          >
            {Object.keys(saga.actors ?? {}).map((name) => (
              <option key={name} value={name}>
                {name} ({saga.actors![name].length} film)
              </option>
            ))}
          </select>
        </div>
      )}
      <div
        className="mb-5 mt-7 flex flex-wrap items-center gap-x-4 gap-y-2"
        aria-live="polite"
      >
        <h2 className="text-xl font-bold">
          {order === "actor" ? `I film di ${actor}` : "Il tuo percorso"}
        </h2>
        <span className="text-sm text-muted">
          {watchedIds ? `${seen} di ${movies.length} visti` : `${movies.length} film`}
        </span>
      </div>
      {watchedIds === null && (
        <p className="mb-4 text-sm text-muted">
          Non è stato possibile caricare i film già visti. Ricarica la pagina per
          riprovare.
        </p>
      )}
      <ol
        id="saga-movies"
        className="grid gap-2 md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] md:gap-x-5 md:gap-y-8"
      >
        {movies.map((movie, index) => (
          <SagaMovieCard
            key={movie.id}
            movie={movie}
            index={index}
            watched={watched.has(movie.id)}
            note={order === "timeline" ? saga.notes?.[movie.id] : undefined}
          />
        ))}
      </ol>
    </section>
  );
}
