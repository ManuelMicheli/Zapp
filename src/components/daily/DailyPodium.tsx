"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { posterUrl } from "@/lib/config";
import { Avatar } from "@/components/social/Avatar";
import type { Podium } from "@/lib/daily/queries";

/** Il primo gradino è più grande e centrale; gli altri due ruotano verso di lui. */
const SHAPE = [
  {
    width: "w-[104px] lg:w-[168px] xl:w-[186px]",
    rotate: "",
    order: "order-2",
    lift: "-mt-5 lg:-mt-8",
  },
  {
    width: "w-[76px] lg:w-[124px] xl:w-[138px]",
    rotate: "[transform:perspective(900px)_rotateY(15deg)]",
    order: "order-1",
    lift: "mt-3",
  },
  {
    width: "w-[76px] lg:w-[124px] xl:w-[138px]",
    rotate: "[transform:perspective(900px)_rotateY(-15deg)]",
    order: "order-3",
    lift: "mt-3",
  },
];

/** I voti salgono da zero: il numero si guarda invece di leggerlo e basta. */
function Conta({ n }: { n: number }) {
  const fermo = useReducedMotion();
  const [v, setV] = useState(fermo ? n : 0);
  useEffect(() => {
    if (fermo) return;
    let corrente = 0;
    const passo = Math.max(1, Math.round(n / 12));
    const id = setInterval(() => {
      corrente = Math.min(n, corrente + passo);
      setV(corrente);
      if (corrente >= n) clearInterval(id);
    }, 45);
    return () => clearInterval(id);
  }, [n, fermo]);
  return <>{v}</>;
}

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
  const classe = "mx-auto flex max-w-[520px] items-start gap-3 px-1";
  return reason.authorUsername ? (
    <Link href={`/u/${reason.authorUsername}`} className={classe}>
      {corpo}
    </Link>
  ) : (
    <figure className={classe}>{corpo}</figure>
  );
}

export function DailyPodium({ podium }: { podium: Podium }) {
  const fermo = useReducedMotion();
  return (
    <div className="flex flex-col gap-5 lg:h-full lg:justify-center lg:gap-7">
      <div className="text-center">
        {/* sul vetro chiaro il grigio più scuro spariva: qui l'overline è bianca smorzata */}
        <p className="text-[11px] uppercase tracking-[0.18em] text-white/55">
          La domanda di ieri
        </p>
        <h2 className="mt-1.5 text-[19px] font-light leading-snug text-text lg:text-[30px]">
          {podium.question}
        </h2>
      </div>

      <ul className="flex items-end justify-center gap-3 lg:gap-5">
        {podium.entries.map((entry, i) => {
          const shape = SHAPE[i] ?? SHAPE[0];
          return (
            <motion.li
              key={`${entry.mediaType}:${entry.titleId}`}
              initial={fermo ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: fermo ? 0 : 0.08 + i * 0.09, duration: 0.32 }}
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
                <p className="mt-2 text-center text-[22px] font-light tabular-nums text-text lg:text-[34px]">
                  {entry.position}
                </p>
                <p className="line-clamp-2 text-center text-[12px] leading-tight text-text lg:text-[15px]">
                  {entry.title}
                </p>
                <p className="text-center text-[11px] tabular-nums text-muted">
                  <Conta n={entry.votes} /> {entry.votes === 1 ? "voto" : "voti"}
                </p>
              </Link>
            </motion.li>
          );
        })}
      </ul>

      {podium.reason && (
        <Firma reason={podium.reason} />
      )}
    </div>
  );
}
