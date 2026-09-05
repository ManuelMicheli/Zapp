"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { backdropUrl } from "@/lib/config";
import { formatCountdown, formatShowingDate, minutesUntil } from "@/lib/cinema/dates";
import { directionsUrl } from "@/lib/cinema/geo";
import { cancelPlan } from "@/lib/cinema/plans";
import type { PlanRow } from "@/lib/cinema/queries";
import { markWatched } from "@/lib/watch/actions";
import { Icon } from "./icons";

/**
 * Serata pianificata: countdown live, Biglietti e Indicazioni. Se lo spettacolo
 * è iniziato da più di 3 h la card chiede "Com'è andata?".
 */
export function PlanCard({ plan }: { plan: PlanRow }) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const [ios, setIos] = useState(false);
  useEffect(() => setIos(/iPhone|iPad|iPod/.test(navigator.userAgent)), []);

  const minutes = minutesUntil(plan.starts_at, now);
  const afterShow = minutes < -180;
  const bg = backdropUrl(plan.backdrop_path, "original");
  const coords =
    plan.cinema_lat != null && plan.cinema_lng != null
      ? { lat: plan.cinema_lat, lng: plan.cinema_lng }
      : null;

  function done(watched: boolean) {
    startTransition(async () => {
      if (watched) {
        const r = await markWatched(plan.tmdb_id, "movie");
        if (!r.ok) {
          show(r.error ?? "Non sono riuscito a segnarlo come visto, riprova");
          return; // il piano resta, l'utente può riprovare
        }
      }
      const c = await cancelPlan(plan.id);
      show(
        !c.ok
          ? "Errore nel rimuovere la serata"
          : watched
            ? "Segnato come visto"
            : "Serata rimossa",
      );
    });
  }

  return (
    <section className="px-5 lg:px-10">
      <div className="relative overflow-hidden rounded-[20px] border border-border bg-surface">
        {bg && (
          <Image
            src={bg}
            alt=""
            fill
            sizes="100vw"
            quality={95}
            className="object-cover opacity-40"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/30" />
        <div className="relative flex flex-col gap-3 p-5">
          <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-accent-pale">
            <Icon name="ticket" size={14} />
            {afterShow ? "Com'è andata?" : "Stasera al cinema"}
          </p>
          <div>
            <Link
              href={`/title/movie/${plan.tmdb_id}`}
              className="text-[22px] font-bold tracking-[-0.03em]"
            >
              {plan.film_title}
            </Link>
            <p className="text-sm text-muted">
              {formatShowingDate(plan.starts_at)} · {plan.cinema_name}
            </p>
            {!afterShow && (
              <p className="mt-1 text-[15px] font-semibold">{formatCountdown(minutes)}</p>
            )}
          </div>

          {afterShow ? (
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => done(true)}
                disabled={pending}
                className="h-11 px-5 text-[15px]"
              >
                L&apos;ho visto
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => done(false)}
                disabled={pending}
                className="h-11 px-5 text-[15px]"
              >
                Non ci sono andato
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <a
                href={plan.booking_url}
                target="_blank"
                rel="noopener"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-white hover:bg-accent-strong"
              >
                <Icon name="ticket" size={16} /> Biglietti
              </a>
              {coords && (
                <a
                  href={directionsUrl(coords, ios)}
                  target="_blank"
                  rel="noopener"
                  className="glass inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-semibold"
                >
                  <Icon name="nav" size={16} /> Indicazioni
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
