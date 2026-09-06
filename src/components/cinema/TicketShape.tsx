"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { backdropUrl, posterUrl } from "@/lib/config";

/**
 * Card a forma di biglietto, condivisa dal foglio "Biglietti" e dal promemoria in
 * home: backdrop del film in cima con il titolo, corpo con l'orario grande e il
 * cinema, perforazione (tacche + tratteggio) e tagliando (`children`).
 * Solo Tailwind e SVG inline. `notch` è il colore delle tacche = fondo su cui poggia.
 */
export function TicketShape({
  backdropPath,
  posterPath,
  title,
  titleHref,
  eyebrow,
  time,
  dateLabel,
  formatLabel,
  cinemaName,
  cinemaLine,
  rightMeta,
  notch = "bg-bg",
  children,
}: {
  backdropPath: string | null;
  posterPath: string | null;
  title: string;
  titleHref?: string | null;
  /** Etichetta sopra il titolo ("Stasera al cinema"). */
  eyebrow?: ReactNode;
  /** "21:15" */
  time: string;
  /** "Sab 6 set" */
  dateLabel: string;
  formatLabel?: string | null;
  cinemaName: string;
  cinemaLine?: string | null;
  /** A destra del corpo (countdown, distanza). */
  rightMeta?: ReactNode;
  /** Classe di sfondo delle tacche: `bg-bg` in pagina, `bg-sheet` nel foglio. */
  notch?: string;
  children?: ReactNode;
}) {
  const bg = backdropUrl(backdropPath, "original") ?? posterUrl(posterPath, "w500");
  const poster = posterUrl(posterPath, "w185");

  return (
    <article className="overflow-hidden rounded-[24px] border border-border bg-surface">
      <div className="relative aspect-video">
        {bg && (
          <Image
            src={bg}
            alt=""
            fill
            sizes="(min-width: 480px) 480px, 100vw"
            quality={95}
            className="object-cover"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-5 pb-3">
          {poster && (
            <div className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
              <Image src={poster} alt="" fill sizes="56px" className="object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className="mb-1 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-accent-pale">
                {eyebrow}
              </p>
            )}
            <h3 className="line-clamp-2 text-[22px] font-bold leading-tight tracking-[-0.03em]">
              {titleHref ? <Link href={titleHref}>{title}</Link> : title}
            </h3>
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-2">
        <div className="min-w-0">
          <p className="flex items-baseline gap-2">
            <span className="text-[40px] font-bold leading-none tracking-[-0.04em]">
              {time}
            </span>
            {formatLabel && (
              <span className="rounded-md bg-accent/20 px-1.5 py-0.5 text-[11px] font-bold text-accent-pale">
                {formatLabel}
              </span>
            )}
          </p>
          <p className="mt-1 text-[14px] text-muted">{dateLabel}</p>
          <p className="mt-2 truncate text-[15px] font-semibold">{cinemaName}</p>
          {cinemaLine && <p className="truncate text-[13px] text-muted">{cinemaLine}</p>}
        </div>
        {rightMeta && (
          <div className="shrink-0 text-right text-[13px] leading-tight">{rightMeta}</div>
        )}
      </div>

      {/* perforazione: due tacche semicircolari del colore del fondo + tratteggio */}
      <div className="relative mx-4 border-t border-dashed border-white/15">
        <span
          aria-hidden
          className={`absolute -left-[29px] -top-[13px] size-[26px] rounded-full border border-border ${notch}`}
        />
        <span
          aria-hidden
          className={`absolute -right-[29px] -top-[13px] size-[26px] rounded-full border border-border ${notch}`}
        />
      </div>

      <div className="px-5 pb-5 pt-4">{children}</div>
    </article>
  );
}
