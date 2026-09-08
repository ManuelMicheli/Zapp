"use client";

import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/config";
import { Avatar } from "@/components/social/Avatar";
import type { Podium } from "@/lib/daily/queries";

/** Il primo gradino è più grande e centrale; gli altri due ruotano verso di lui. */
const SHAPE = [
  { width: "w-36 lg:w-52", rotate: "", order: "order-2", lift: "-mt-6 lg:-mt-10" },
  {
    width: "w-24 lg:w-36",
    rotate: "[transform:perspective(900px)_rotateY(16deg)]",
    order: "order-1",
    lift: "mt-4",
  },
  {
    width: "w-24 lg:w-36",
    rotate: "[transform:perspective(900px)_rotateY(-16deg)]",
    order: "order-3",
    lift: "mt-4",
  },
];

/** Il motivo in evidenza, firmato: il nome porta al profilo di chi l'ha scritto. */
function Firma({ reason }: { reason: NonNullable<Podium["reason"]> }) {
  const nome = reason.authorName ?? "Un utente";
  const corpo = (
    <>
      <Avatar url={reason.authorAvatar} name={nome} size={36} />
      <blockquote className="text-[14px] leading-relaxed text-text">
        «{reason.reason}»
        <figcaption className="mt-1 text-[12px] text-muted">{nome}</figcaption>
      </blockquote>
    </>
  );
  const classe =
    "mx-auto flex max-w-[560px] items-start gap-3 rounded-[20px] border border-border bg-surface/70 px-4 py-3";
  return reason.authorUsername ? (
    <Link href={`/u/${reason.authorUsername}`} className={classe}>
      {corpo}
    </Link>
  ) : (
    <figure className={classe}>{corpo}</figure>
  );
}

export function DailyPodium({ podium }: { podium: Podium }) {
  return (
    <div className="flex h-full flex-col justify-center gap-8 px-5 lg:px-10">
      <div className="mx-auto max-w-[720px] text-center">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-2">
          La domanda di ieri
        </p>
        <h2 className="mt-2 text-[22px] font-light leading-snug text-text lg:text-[30px]">
          {podium.question}
        </h2>
      </div>

      <ul className="flex items-end justify-center gap-3 lg:gap-6">
        {podium.entries.map((entry, i) => {
          const shape = SHAPE[i] ?? SHAPE[0];
          return (
            <li
              key={`${entry.mediaType}:${entry.titleId}`}
              className={`${shape.order} ${shape.lift}`}
            >
              <Link href={`/title/${entry.mediaType}/${entry.titleId}`} className="block">
                <div
                  className={`relative aspect-[2/3] overflow-hidden rounded-[18px] border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.6)] ${shape.width} ${shape.rotate}`}
                >
                  {entry.posterPath ? (
                    <Image
                      src={posterUrl(entry.posterPath, "w342")!}
                      alt=""
                      fill
                      sizes="(max-width: 1023px) 144px, 208px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="size-full bg-surface-2" />
                  )}
                </div>
                <p className="mt-3 text-center text-[26px] font-light tabular-nums text-text lg:text-[34px]">
                  {entry.position}
                </p>
                <p className="line-clamp-2 max-w-[150px] text-center text-[13px] text-text lg:max-w-[208px] lg:text-[15px]">
                  {entry.title}
                </p>
                <p className="text-center text-[12px] text-muted">
                  {entry.votes} {entry.votes === 1 ? "voto" : "voti"}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      {podium.reason && (
        <Firma reason={podium.reason} />
      )}
    </div>
  );
}
