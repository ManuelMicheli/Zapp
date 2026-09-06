"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toaster";
import { backdropUrl, posterUrl } from "@/lib/config";
import {
  countdownParts,
  formatTime,
  minutesUntil,
  nextDay,
  romeDateString,
} from "@/lib/cinema/dates";
import { formatLabel } from "@/lib/cinema/formats";
import { directionsUrl } from "@/lib/cinema/geo";
import { cancelPlan } from "@/lib/cinema/plans";
import type { PlanRow } from "@/lib/cinema/queries";
import { removeTicket } from "@/lib/cinema/tickets";
import { markWatched } from "@/lib/watch/actions";
import { Icon } from "./icons";
import { QrFullscreen } from "./QrFullscreen";
import { TicketImport } from "./TicketImport";
import { useQrImages } from "./TicketQr";

/** "Stasera" / "Domani" / "Sab 6 set" secondo il giorno dello spettacolo (Roma). */
function whenLabel(iso: string): string {
  const day = romeDateString(new Date(iso));
  const today = romeDateString();
  if (day === today) return "Stasera";
  if (day === nextDay(today)) return "Domani";
  const s = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const PILL =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-[18px] text-[15px] font-semibold lg:h-12";
const PILL_ACCENT = `${PILL} bg-accent text-white shadow-[var(--shadow-accent)] hover:bg-accent-strong`;
const PILL_GLASS = `${PILL} glass text-text hover:bg-white/15`;

/**
 * Promemoria della serata in home ("Stasera A · Cinematico"): fondale del film a
 * tutta card, conto alla rovescia in cifre grandi e leggere, titolo, orario e sala;
 * Biglietto (apre il QR importato a tutto schermo, altrimenti la biglietteria) e
 * Indicazioni. Senza biglietto, "Aggiungi il biglietto". Iniziato da più di 3 h,
 * la card chiede "Com'è andata?".
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
  const [qrOpen, setQrOpen] = useState(false);

  const minutes = minutesUntil(plan.starts_at, now);
  const afterShow = minutes < -180;
  const parts = countdownParts(minutes);
  const coords =
    plan.cinema_lat != null && plan.cinema_lng != null
      ? { lat: plan.cinema_lat, lng: plan.cinema_lng }
      : null;
  const codes = plan.ticket_codes ?? [];
  const urls = useQrImages(codes);
  const hasTicket = codes.length > 0 || !!ticketUrl;
  const fmt = plan.format ? formatLabel(plan.format) : null;
  const bg =
    backdropUrl(plan.backdrop_path, "original") ?? posterUrl(plan.poster_path, "w500");

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
      <article className="relative flex min-h-[292px] flex-col justify-end overflow-hidden rounded-[20px] border border-border bg-surface lg:min-h-[320px]">
        {bg && (
          <Image
            src={bg}
            alt=""
            fill
            sizes="100vw"
            quality={95}
            className="object-cover object-[50%_30%]"
          />
        )}
        {/* veli: dal basso e da sinistra, il fondale resta nudo in alto a destra */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.4)_0%,rgba(0,0,0,0)_30%,rgba(0,0,0,0.55)_60%,rgba(0,0,0,0.92)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.45)_0%,rgba(0,0,0,0)_55%)]" />

        <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-2">
          <span className="glass inline-flex h-[30px] items-center gap-1.5 rounded-full pl-2.5 pr-3 text-[12px] font-semibold">
            <Icon name="ticket" size={14} />
            {afterShow ? "Com'è andata?" : whenLabel(plan.starts_at)}
          </span>
          {hasTicket && !afterShow && (
            <button
              type="button"
              onClick={dropTicket}
              disabled={pending}
              className="glass h-[30px] rounded-full px-3 text-[12px] font-semibold text-white/85 disabled:opacity-50"
            >
              Rimuovi biglietto
            </button>
          )}
        </div>

        <div className="relative flex flex-col gap-3 p-4 pt-24 lg:flex-row lg:items-end lg:justify-between lg:gap-4 lg:px-8 lg:pb-7">
          <div className="flex min-w-0 flex-col gap-1.5 lg:gap-2.5">
            {!afterShow && (
              <p className="tabular-nums text-[40px] font-light leading-[0.95] tracking-[-0.05em] lg:text-[64px]">
                {parts ? (
                  parts.hours > 0 ? (
                    <>
                      {parts.hours}
                      <Unit>h</Unit>
                      {parts.minutes}
                      <Unit last>min</Unit>
                    </>
                  ) : (
                    <>
                      {parts.minutes}
                      <Unit last>min</Unit>
                    </>
                  )
                ) : (
                  "Iniziato"
                )}
              </p>
            )}
            <h3 className="truncate text-[22px] font-extrabold leading-[1.05] tracking-[-0.04em] lg:text-[36px]">
              <Link href={`/title/movie/${plan.tmdb_id}`}>{plan.film_title}</Link>
            </h3>
            <p className="flex min-w-0 items-center gap-2 text-[13px] text-white/75 lg:text-[15px]">
              <span className="truncate">
                {formatTime(plan.starts_at)} · {plan.cinema_name}
              </span>
              {fmt && (
                <span className="shrink-0 rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
                  {fmt}
                </span>
              )}
            </p>
          </div>

          {afterShow ? (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => done(true)}
                disabled={pending}
                className={PILL_ACCENT}
              >
                <Icon name="check" size={16} /> L&apos;ho visto
              </button>
              <button
                type="button"
                onClick={() => done(false)}
                disabled={pending}
                className={PILL_GLASS}
              >
                Non ci sono andato
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {hasTicket ? (
                <button
                  type="button"
                  onClick={() => setQrOpen(true)}
                  className={PILL_ACCENT}
                >
                  <Icon name="qr" size={16} /> Biglietto
                </button>
              ) : (
                <a
                  href={plan.booking_url}
                  target="_blank"
                  rel="noopener"
                  className={PILL_ACCENT}
                >
                  <Icon name="ticket" size={16} /> Biglietti
                </a>
              )}
              {coords && (
                <a
                  href={directionsUrl(coords, ios)}
                  target="_blank"
                  rel="noopener"
                  className={PILL_GLASS}
                >
                  <Icon name="nav" size={16} /> Indicazioni
                </a>
              )}
              {!hasTicket && <TicketImport planId={plan.id} userId={userId} compact />}
            </div>
          )}
        </div>
      </article>

      {hasTicket && (
        <QrFullscreen
          open={qrOpen}
          onClose={() => setQrOpen(false)}
          codes={codes}
          urls={urls}
          originalUrl={ticketUrl}
        />
      )}
    </section>
  );
}

/** Unità piccola accanto alle cifre grandi ("h", "min"). */
function Unit({ children, last = false }: { children: string; last?: boolean }) {
  return (
    <span
      className={`text-[18px] font-medium tracking-normal lg:text-[28px] ${last ? "ml-1" : "mx-1"}`}
    >
      {children}
    </span>
  );
}
