"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Sheet } from "@/components/ui/Sheet";
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
import { cancelPlan, getPlanAlternatives, movePlan } from "@/lib/cinema/plans";
import type { PlanRow } from "@/lib/cinema/queries";
import type { Showing } from "@/lib/cinema/types";
import { useOptimisticValue } from "@/lib/ui/optimistic";
import { ChainBadge } from "./ChainBadge";
import { removeTicket } from "@/lib/cinema/tickets";
import { Icon } from "./icons";
import { QrFullscreen } from "./QrFullscreen";
import { ScanMode } from "./ScanMode";
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
const PILL_ACCENT = `${PILL} glass-accent text-white`;
const PILL_GLASS = `${PILL} glass text-text hover:bg-white/15`;

/**
 * Promemoria della serata in home ("Stasera A · Cinematico"): fondale del film a
 * tutta card, conto alla rovescia in cifre grandi e leggere, titolo, orario e sala;
 * Biglietto (apre il QR importato a tutto schermo, altrimenti la biglietteria) e
 * Indicazioni. Senza biglietto, "Aggiungi il biglietto". Il tondo in alto a destra
 * apre le tre azioni rapide: cambia orario, rimuovi il biglietto, rimuovi la serata.
 * Un'ora dopo l'inizio la card sparisce dalla home (`planPhase`): a film finito
 * torna come `PostShowCard`, che chiede com'è andata.
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
  // la serata e il suo biglietto insieme: `null` = serata tolta, la card sparisce
  const {
    value: view,
    pending,
    run,
  } = useOptimisticValue<{
    plan: PlanRow;
    ticketUrl: string | null;
  } | null>({ plan, ticketUrl });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const [ios, setIos] = useState(false);
  useEffect(() => setIos(/iPhone|iPad|iPod/.test(navigator.userAgent)), []);
  const [qrOpen, setQrOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [timesOpen, setTimesOpen] = useState(false);
  const [alternatives, setAlternatives] = useState<Showing[] | null>(null);
  const [altError, setAltError] = useState<string | null>(null);
  const [, startLoadingTimes] = useTransition();

  const codes = view?.plan.ticket_codes ?? [];
  const urls = useQrImages(codes);

  if (!view) return null;
  const shown = view.plan;

  const parts = countdownParts(minutesUntil(shown.starts_at, now));
  const coords =
    shown.cinema_lat != null && shown.cinema_lng != null
      ? { lat: shown.cinema_lat, lng: shown.cinema_lng }
      : null;
  const hasTicket = codes.length > 0 || !!view.ticketUrl;
  const fmt = shown.format ? formatLabel(shown.format) : null;
  const bg =
    backdropUrl(shown.backdrop_path, "original") ?? posterUrl(shown.poster_path, "w500");

  function drop() {
    setMenuOpen(false);
    run(null, () => cancelPlan(plan.id), { message: "Serata rimossa" });
  }

  function dropTicket() {
    setMenuOpen(false);
    run(
      {
        plan: { ...plan, ticket_codes: [], ticket_path: null, seats: [], hall: null },
        ticketUrl: null,
      },
      () => removeTicket(plan.id),
      { message: "Biglietto rimosso" },
    );
  }

  /** Apre il foglio degli orari e intanto chiede alla sorgente quelli di oggi. */
  function openTimes() {
    setMenuOpen(false);
    setTimesOpen(true);
    setAlternatives(null);
    setAltError(null);
    startLoadingTimes(async () => {
      const r = await getPlanAlternatives(plan.id);
      setAlternatives(r.showings);
      setAltError(r.error ?? null);
    });
  }

  function move(showing: Showing) {
    setTimesOpen(false);
    run(
      {
        plan: {
          ...plan,
          starts_at: showing.start,
          format: showing.format,
          booking_url: showing.bookingUrl,
        },
        ticketUrl,
      },
      () => movePlan(plan.id, showing),
      { message: `Spostata alle ${formatTime(showing.start)}` },
    );
  }

  return (
    <section className="px-5 lg:px-10">
      <article className="relative flex w-full min-h-[292px] flex-col justify-end overflow-hidden rounded-[20px] border border-border bg-surface md:aspect-[42/9] md:min-h-[225px]">
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
        {/* veli: dal basso e da sinistra, il fondale resta nudo in alto a destra */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.4)_0%,rgba(0,0,0,0)_30%,rgba(0,0,0,0.55)_60%,rgba(0,0,0,0.92)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.45)_0%,rgba(0,0,0,0)_55%)]" />

        <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-2">
          <span className="glass inline-flex h-[30px] items-center gap-1.5 rounded-full pl-2.5 pr-3 text-[12px] font-semibold">
            <Icon name="ticket" size={14} />
            {whenLabel(shown.starts_at)}
          </span>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            disabled={pending}
            aria-label="Azioni sulla serata"
            className="glass grid size-[30px] place-items-center rounded-full text-white/85 disabled:opacity-50"
          >
            <Icon name="more" size={16} />
          </button>
        </div>

        <div className="relative flex flex-col gap-3 p-4 pt-24 md:pt-14 lg:flex-row lg:items-end lg:justify-between lg:gap-4 lg:px-8 lg:pb-7">
          <div className="flex min-w-0 flex-col gap-1.5 lg:gap-2.5">
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
            <h3 className="truncate text-[22px] font-extrabold leading-[1.05] tracking-[-0.04em] lg:text-[36px]">
              <Link href={`/title/movie/${shown.tmdb_id}`}>{shown.film_title}</Link>
            </h3>
            <p className="flex min-w-0 items-center gap-2 text-[13px] text-white/75 lg:text-[15px]">
              <ChainBadge cinemaName={shown.cinema_name} size={26} />
              <span className="truncate">
                {formatTime(shown.starts_at)} · {shown.cinema_name}
              </span>
              {fmt && (
                <span className="shrink-0 rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
                  {fmt}
                </span>
              )}
            </p>
          </div>

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
                href={shown.booking_url}
                target="_blank"
                rel="noopener"
                className={PILL_ACCENT}
              >
                <Icon name="ticket" size={16} /> Biglietti
              </a>
            )}
            {hasTicket && codes.length > 0 && (
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                className={PILL_GLASS}
              >
                <Icon name="pin" size={16} /> Sono qui
              </button>
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
            {!hasTicket && <TicketImport planId={shown.id} userId={userId} compact />}
          </div>
        </div>
      </article>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="La tua serata">
        <div className="flex flex-col">
          <SheetItem label="Cambia orario" onClick={openTimes} />
          {hasTicket && <SheetItem label="Rimuovi il biglietto" onClick={dropTicket} />}
          <SheetItem label="Rimuovi la serata" danger onClick={drop} />
        </div>
      </Sheet>

      <Sheet open={timesOpen} onClose={() => setTimesOpen(false)} title="Cambia orario">
        <p className="px-1 pb-3 text-[13px] text-muted">Oggi al {shown.cinema_name}</p>
        {alternatives === null ? (
          <p className="px-1 pb-4 text-[14px] text-muted">Cerco gli orari…</p>
        ) : alternatives.length === 0 ? (
          <p className="px-1 pb-4 text-[14px] text-muted">
            {altError ?? "Nessun altro orario oggi in questa sala"}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 pb-2">
            {alternatives.map((s) => (
              <button
                key={s.start}
                type="button"
                onClick={() => move(s)}
                disabled={pending}
                className="flex flex-col items-center gap-0.5 rounded-2xl border border-border bg-surface-2 py-3 disabled:opacity-50"
              >
                <span className="text-[17px] font-bold tabular-nums">
                  {formatTime(s.start)}
                </span>
                {s.format && s.format !== shown.format && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {formatLabel(s.format)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </Sheet>

      {hasTicket && (
        <QrFullscreen
          open={qrOpen}
          onClose={() => setQrOpen(false)}
          codes={codes}
          urls={urls}
          originalUrl={view.ticketUrl}
        />
      )}

      {codes.length > 0 && (
        <ScanMode
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          planId={shown.id}
          codes={codes}
          urls={urls}
          seats={shown.seats ?? []}
          hall={shown.hall}
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

/** Riga del foglio azioni: stesse classi dello sheet "Azioni" della scheda titolo. */
function SheetItem({
  label,
  onClick,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl px-4 py-3 text-left text-base font-medium hover:bg-surface-2 ${
        danger ? "text-danger" : ""
      }`}
    >
      {label}
    </button>
  );
}
