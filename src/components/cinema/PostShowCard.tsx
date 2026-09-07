"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toaster";
import { backdropUrl, posterUrl } from "@/lib/config";
import { formatShowingDate } from "@/lib/cinema/dates";
import { cancelPlan } from "@/lib/cinema/plans";
import type { PlanRow } from "@/lib/cinema/queries";
import { markWatched, setRating } from "@/lib/watch/actions";
import { Icon } from "./icons";

const PILL =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-[18px] text-[15px] font-semibold lg:h-12";
const PILL_ACCENT = `${PILL} bg-accent text-white shadow-[var(--shadow-accent)] hover:bg-accent-strong`;
const PILL_GLASS = `${PILL} glass text-text hover:bg-white/15`;

/**
 * Il bentornato dopo il cinema: quando il film è finito (`planPhase`), al rientro
 * nell'app la home chiede com'è andata. "L'ho visto" segna il film come visto e apre
 * il voto ("Ti è piaciuto?", 1–10 come nella scheda titolo); "Non ci sono andato"
 * chiude e basta. In entrambi i casi la serata sparisce: risposta data, niente più
 * promemoria. Stessa forma del banner "Stasera" (`PlanCard`), così la home non cambia
 * geometria fra prima e dopo.
 */
export function PostShowCard({ plan }: { plan: PlanRow }) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [rating, setRatingStep] = useState(false);

  const bg =
    backdropUrl(plan.backdrop_path, "original") ?? posterUrl(plan.poster_path, "w500");

  /** "L'ho visto": il film entra fra i visti, poi si chiede il voto. */
  function watched() {
    startTransition(async () => {
      const r = await markWatched(plan.tmdb_id, "movie");
      if (!r.ok) {
        show(r.error ?? "Non sono riuscito a segnarlo come visto, riprova");
        return; // la serata resta: si può riprovare
      }
      setRatingStep(true);
    });
  }

  /** Voto (o "Salta"): chiusa la domanda, la serata si può togliere. */
  function close(vote: number | null) {
    startTransition(async () => {
      if (vote !== null) await setRating(plan.tmdb_id, "movie", vote);
      const c = await cancelPlan(plan.id);
      if (!c.ok) {
        show("Errore nel chiudere la serata");
        return;
      }
      show(vote !== null ? `Votato ${vote}/10` : "Buona visione la prossima!");
    });
  }

  function skipped() {
    startTransition(async () => {
      const c = await cancelPlan(plan.id);
      show(c.ok ? "Serata rimossa" : "Errore nel rimuovere la serata");
    });
  }

  return (
    <section className="px-5 lg:px-10">
      <article className="relative flex min-h-[216px] flex-col justify-end overflow-hidden rounded-[20px] border border-border bg-surface md:aspect-[3/1] md:min-h-0">
        {bg && (
          <Image
            src={bg}
            alt=""
            fill
            sizes="100vw"
            unoptimized
            className="object-cover object-[50%_30%] md:object-center"
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.4)_0%,rgba(0,0,0,0)_30%,rgba(0,0,0,0.55)_60%,rgba(0,0,0,0.92)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.45)_0%,rgba(0,0,0,0)_55%)]" />

        <div className="absolute left-4 top-4">
          <span className="glass inline-flex h-[30px] items-center gap-1.5 rounded-full pl-2.5 pr-3 text-[12px] font-semibold">
            <Icon name="ticket" size={14} />
            {formatShowingDate(plan.starts_at)}
          </span>
        </div>

        <div className="relative flex flex-col gap-3 p-4 pt-10 lg:flex-row lg:items-end lg:justify-between lg:gap-4 lg:px-8 lg:pb-7">
          <div className="flex min-w-0 flex-col gap-1.5 lg:gap-2.5">
            <p className="text-[28px] font-light leading-[1] tracking-[-0.04em] lg:text-[44px]">
              {rating ? "Ti è piaciuto?" : "Com'è andata?"}
            </p>
            <h3 className="truncate text-[22px] font-extrabold leading-[1.05] tracking-[-0.04em] lg:text-[36px]">
              <Link href={`/title/movie/${plan.tmdb_id}`}>{plan.film_title}</Link>
            </h3>
            <p className="truncate text-[13px] text-white/75 lg:text-[15px]">
              {plan.cinema_name}
            </p>
          </div>

          {rating ? (
            <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => close(n)}
                    disabled={pending}
                    className="glass size-9 rounded-full text-[15px] font-bold tabular-nums hover:bg-white/20 disabled:opacity-50 lg:size-10"
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => close(null)}
                disabled={pending}
                className="px-1 text-[13px] font-semibold text-white/70 disabled:opacity-50"
              >
                Salta il voto
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={watched}
                disabled={pending}
                className={PILL_ACCENT}
              >
                <Icon name="check" size={16} /> L&apos;ho visto
              </button>
              <button
                type="button"
                onClick={skipped}
                disabled={pending}
                className={PILL_GLASS}
              >
                Non ci sono andato
              </button>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
