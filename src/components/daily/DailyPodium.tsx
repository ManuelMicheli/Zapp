"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { posterUrl } from "@/lib/config";
import { Avatar } from "@/components/social/Avatar";
import type { Podium } from "@/lib/daily/queries";
import { Confetti } from "./Confetti";

/**
 * Il podio vero: tre gradini, il vincitore al centro sul più alto, una medaglia
 * appesa al bordo basso della locandina e — solo alla prima apertura del giorno —
 * i coriandoli che annunciano chi ha vinto.
 *
 * Ordine di lettura sul telefono: domanda, podio, motivo. Da `lg` il riquadro è
 * 21:9 e la colonna sinistra tiene domanda e motivo, così i gradini possono
 * essere alti davvero invece di schiacciarsi.
 */

/** Oro, argento, bronzo: colori di materiale, come i marchi delle piattaforme. */
const MEDALS = [
  {
    ring: "conic-gradient(from 210deg, #7a5a16, #e6c15f 22%, #fff3c4 42%, #c9a13f 64%, #7a5a16)",
    glow: "0 0 0 1px rgba(230,193,95,0.45), 0 10px 26px rgba(230,193,95,0.35)",
    text: "#3a2a05",
  },
  {
    ring: "conic-gradient(from 210deg, #6b7078, #d8dbe2 22%, #ffffff 42%, #a8adb6 64%, #6b7078)",
    glow: "0 0 0 1px rgba(216,219,226,0.35), 0 8px 20px rgba(0,0,0,0.45)",
    text: "#2a2d33",
  },
  {
    ring: "conic-gradient(from 210deg, #6a4322, #c08457 22%, #e8b48a 42%, #95602f 64%, #6a4322)",
    glow: "0 0 0 1px rgba(192,132,87,0.35), 0 8px 20px rgba(0,0,0,0.45)",
    text: "#3a2210",
  },
];

/** Il gradino: alto quanto vale il posto. Il primo è anche il più largo. */
const STEP = [
  { order: "order-2", step: "h-[106px] w-[122px] lg:h-[136px] lg:w-[178px]" },
  { order: "order-1", step: "h-[90px] w-[100px] lg:h-[114px] lg:w-[146px]" },
  { order: "order-3", step: "h-[78px] w-[100px] lg:h-[96px] lg:w-[146px]" },
];

/** La locandina sta sul suo gradino: sempre più stretta del gradino che la regge. */
const POSTER = [
  "w-[102px] lg:w-[144px] xl:w-[152px]",
  "w-[78px] lg:w-[112px] xl:w-[118px]",
  "w-[78px] lg:w-[112px] xl:w-[118px]",
];

/** L'ombra scritta a mano: sopra il fotogramma il grigio dei token sparisce. */
const SHADOW = "[text-shadow:0_1px_10px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.7)]";

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

/** La medaglia, appesa al bordo basso della locandina. */
function Medal({ position }: { position: number }) {
  const m = MEDALS[position - 1] ?? MEDALS[2];
  return (
    <span
      aria-hidden="true"
      className="absolute -bottom-3 left-1/2 flex size-7 -translate-x-1/2 items-center justify-center rounded-full lg:-bottom-3.5 lg:size-8"
      style={{ backgroundImage: m.ring, boxShadow: m.glow }}
    >
      <span
        className="flex size-[18px] items-center justify-center rounded-full bg-white/85 text-[11px] font-bold lg:size-5 lg:text-[12px]"
        style={{ color: m.text }}
      >
        {position}
      </span>
    </span>
  );
}

/** Il motivo in evidenza, firmato: il nome porta al profilo di chi l'ha scritto. */
function Firma({ reason }: { reason: NonNullable<Podium["reason"]> }) {
  const nome = reason.authorName ?? "Un utente";
  const corpo = (
    <>
      <Avatar url={reason.authorAvatar} name={nome} size={36} />
      <blockquote
        className={`text-[14px] font-medium leading-relaxed text-white ${SHADOW}`}
      >
        «{reason.reason}»
        <figcaption className={`mt-1 text-[12px] text-white/85 ${SHADOW}`}>
          {nome}
        </figcaption>
      </blockquote>
    </>
  );
  const classe = "mx-auto flex max-w-[520px] items-start gap-3 px-1 lg:mx-0";
  return reason.authorUsername ? (
    <Link href={`/u/${reason.authorUsername}`} className={classe}>
      {corpo}
    </Link>
  ) : (
    <figure className={classe}>{corpo}</figure>
  );
}

export function DailyPodium({
  podium,
  celebrate = false,
}: {
  podium: Podium;
  celebrate?: boolean;
}) {
  const fermo = useReducedMotion();
  const [festa, setFesta] = useState(celebrate);

  return (
    <div className="relative flex flex-col gap-6 lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10">
      {festa && <Confetti onDone={() => setFesta(false)} />}

      <div className="flex flex-col gap-4 text-center lg:gap-6 lg:text-left">
        <div>
          <p
            className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 ${SHADOW}`}
          >
            La domanda di ieri
          </p>
          <h2
            className={`mt-1.5 text-[19px] font-medium leading-snug text-white ${SHADOW} lg:text-[28px] lg:leading-[1.15]`}
          >
            {podium.question}
          </h2>
        </div>
        {podium.reason && <Firma reason={podium.reason} />}
      </div>

      <div className="flex flex-col items-center">
        {/* i tre gradini si toccano: separati da uno spazio sembravano tre schede,
            attaccati sono un podio solo */}
        <ul className="flex items-end justify-center">
          {podium.entries.map((entry, i) => {
            const step = STEP[i] ?? STEP[0];
            const vincitore = i === 0;
            return (
              <motion.li
                key={`${entry.mediaType}:${entry.titleId}`}
                initial={fermo ? false : { opacity: 0, y: 26 }}
                animate={{ opacity: 1, y: 0 }}
                // i gradini salgono dal terzo al primo: l'ultimo ad arrivare è chi ha vinto
                transition={{
                  delay: fermo ? 0 : 0.1 + (2 - i) * 0.12,
                  type: "spring",
                  stiffness: 260,
                  damping: 26,
                }}
                className={`${step.order} flex flex-col items-center`}
              >
                <Link
                  href={`/title/${entry.mediaType}/${entry.titleId}`}
                  className="flex flex-col items-center"
                >
                  <div className={`relative ${POSTER[i] ?? POSTER[2]}`}>
                    {vincitore && (
                      // il bagliore dorato è la sola decorazione del podio, e sta solo
                      // dietro a chi ha vinto
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -inset-8 rounded-full bg-[radial-gradient(closest-side,rgba(230,193,95,0.55),rgba(230,193,95,0))] blur-[2px]"
                      />
                    )}
                    <div
                      className={`relative aspect-[2/3] overflow-hidden rounded-[16px] border ${
                        vincitore
                          ? "border-[#e6c15f]/45 shadow-[0_24px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(230,193,95,0.25)]"
                          : "border-white/12 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
                      }`}
                    >
                      {entry.posterPath ? (
                        <Image
                          src={posterUrl(entry.posterPath, "w342")!}
                          alt=""
                          fill
                          sizes="(max-width: 1023px) 120px, 160px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="size-full bg-surface-2" />
                      )}
                    </div>
                    <Medal position={entry.position} />
                  </div>

                  {/* Il gradino non è una scatola vuota sotto al titolo: il titolo e i
                    voti stanno **dentro** al gradino, che è quindi la targa del posto.
                    Vetro, filo di luce in cima, e sotto al primo un alone viola. */}
                  <div
                    className={`mt-4 flex flex-col items-center rounded-t-[14px] border-x border-t border-white/10 bg-gradient-to-b px-2 pt-2.5 ${
                      vincitore
                        ? "from-white/[0.22] to-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_-16px_40px_rgba(197,186,244,0.25)]"
                        : "from-white/[0.13] to-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.32)]"
                    } ${step.step}`}
                  >
                    <p
                      className={`line-clamp-2 text-center text-[12px] font-semibold leading-[1.15] text-white ${SHADOW} lg:text-[13px]`}
                    >
                      {entry.title}
                    </p>
                    <p
                      className={`mt-1 text-center text-[11px] font-light tabular-nums text-white/75 ${SHADOW} lg:text-[12px]`}
                    >
                      <span
                        className={`mr-1 text-[19px] font-light lg:text-[23px] ${
                          vincitore ? "text-[#f0d68e]" : "text-white"
                        }`}
                      >
                        <Conta n={entry.votes} />
                      </span>
                      {entry.votes === 1 ? "voto" : "voti"}
                    </p>
                  </div>
                </Link>
              </motion.li>
            );
          })}
        </ul>
        {/* il pavimento: un filo di luce che chiude i tre gradini e li fa stare
            su qualcosa invece di galleggiare */}
        <div
          aria-hidden="true"
          className="h-px w-full max-w-[330px] bg-gradient-to-r from-transparent via-white/45 to-transparent lg:max-w-[400px]"
        />
      </div>
    </div>
  );
}
