"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { formatCountdown, formatTime, minutesUntil } from "@/lib/cinema/dates";
import { formatLabel } from "@/lib/cinema/formats";
import { directionsUrl } from "@/lib/cinema/geo";
import { cancelPlan } from "@/lib/cinema/plans";
import type { PlanRow } from "@/lib/cinema/queries";
import { removeTicket } from "@/lib/cinema/tickets";
import { markWatched } from "@/lib/watch/actions";
import { Icon } from "./icons";
import { QrFullscreen } from "./QrFullscreen";
import { TicketImport } from "./TicketImport";
import { TicketQr } from "./TicketQr";
import { TicketShape } from "./TicketShape";

/** "Sabato 6 settembre" */
function dayLabel(iso: string): string {
  const s = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Promemoria della serata in home, a forma di biglietto: backdrop del film, orario
 * grande con countdown live, tagliando con i QR del biglietto (tocco → tutto
 * schermo) o "Aggiungi il biglietto", Biglietti e Indicazioni. Se lo spettacolo è
 * iniziato da più di 3 h la card chiede "Com'è andata?".
 */
export function PlanCard({
  plan,
  ticketUrl,
  userId,
}: {
  plan: PlanRow;
  /** URL firmato dell'originale caricato (bucket privato), se c'è. */
  ticketUrl: string | null;
  userId: string;
}) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const [ios, setIos] = useState(false);
  useEffect(() => setIos(/iPhone|iPad|iPod/.test(navigator.userAgent)), []);
  const [originalOpen, setOriginalOpen] = useState(false);

  const minutes = minutesUntil(plan.starts_at, now);
  const afterShow = minutes < -180;
  const coords =
    plan.cinema_lat != null && plan.cinema_lng != null
      ? { lat: plan.cinema_lat, lng: plan.cinema_lng }
      : null;
  const codes = plan.ticket_codes ?? [];
  const hasTicket = codes.length > 0 || !!plan.ticket_path;

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

  function dropTicket() {
    startTransition(async () => {
      const r = await removeTicket(plan.id);
      show(r.ok ? "Biglietto rimosso" : (r.error ?? "Errore"));
    });
  }

  return (
    <section className="px-5 lg:px-10">
      <TicketShape
        backdropPath={plan.backdrop_path}
        posterPath={plan.poster_path}
        title={plan.film_title}
        titleHref={`/title/movie/${plan.tmdb_id}`}
        eyebrow={
          <>
            <Icon name="ticket" size={14} />
            {afterShow ? "Com'è andata?" : "Stasera al cinema"}
          </>
        }
        time={formatTime(plan.starts_at)}
        dateLabel={dayLabel(plan.starts_at)}
        formatLabel={plan.format ? formatLabel(plan.format) : null}
        cinemaName={plan.cinema_name}
        cinemaLine={plan.cinema_address}
        rightMeta={
          !afterShow ? (
            <p className="text-[15px] font-semibold text-accent-pale">
              {formatCountdown(minutes)}
            </p>
          ) : null
        }
      >
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
          <div className="flex flex-col gap-4">
            {codes.length > 0 ? (
              <div className="flex items-start justify-between gap-3">
                <TicketQr codes={codes} originalUrl={ticketUrl} />
                <button
                  type="button"
                  onClick={dropTicket}
                  disabled={pending}
                  className="shrink-0 text-[13px] font-medium text-muted underline-offset-4 hover:underline"
                >
                  Rimuovi
                </button>
              </div>
            ) : ticketUrl ? (
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setOriginalOpen(true)}
                  className="overflow-hidden rounded-[14px] bg-white"
                  aria-label="Apri il biglietto a tutto schermo"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL firmato del bucket privato */}
                  <img
                    src={ticketUrl}
                    alt="Biglietto"
                    className="max-h-[220px] w-auto max-w-full"
                  />
                </button>
                <button
                  type="button"
                  onClick={dropTicket}
                  disabled={pending}
                  className="shrink-0 text-[13px] font-medium text-muted underline-offset-4 hover:underline"
                >
                  Rimuovi
                </button>
                <QrFullscreen
                  open={originalOpen}
                  onClose={() => setOriginalOpen(false)}
                  codes={[]}
                  urls={[]}
                  originalUrl={ticketUrl}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[13px] text-muted">
                  Hai comprato i biglietti? Aggiungili: il QR sarà qui, pronto da
                  mostrare.
                </p>
                <TicketImport planId={plan.id} userId={userId} compact />
              </div>
            )}

            <div className="flex gap-2">
              <a
                href={plan.booking_url}
                target="_blank"
                rel="noopener"
                className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-semibold ${
                  hasTicket ? "glass" : "bg-accent text-white hover:bg-accent-strong"
                }`}
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
          </div>
        )}
      </TicketShape>
    </section>
  );
}
