"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { PreviewPayload } from "@/app/api/preview/[mediaType]/[id]/route";
import { trailerCoverBox } from "@/lib/preview/position";

const YT_ORIGIN = "https://www.youtube-nocookie.com";

/** Riquadro dell'immagine: 16:9 sulla larghezza della scheda (`previewWidth`). */
export const mediaHeight = (width: number) => Math.round((width * 9) / 16);
/** Altezza stimata usata per posizionare la scheda prima di misurarla. */
export const heightGuess = (width: number) => mediaHeight(width) + 210;

/**
 * Fattore di layout del player: YouTube sceglie la qualità dalla dimensione di layout
 * dell'iframe, non dal DPR. Un riquadro da 480-660px darebbe 360p, quindi l'iframe viene
 * disposto 3× più grande e ridotto con `transform` (stessa tecnica di
 * `CinematicBackdrop`, dove il fattore è 6 sul telefono e 2 da lg).
 */
const YT_SCALE = 3;
/**
 * Attesa dopo il "playing" prima di scoprire il video. YouTube tiene i propri comandi
 * (pausa, "precedente") in mezzo al frame per 3-4 secondi dal play e li nasconde da
 * solo: scoprendo prima si vedrebbero in mezzo all'anteprima. Nel frattempo si vede il
 * fotogramma del titolo, quindi l'attesa non lascia mai un buco.
 */
const REVEAL_DELAY_MS = 3500;

function ytPost(frame: HTMLIFrameElement | null, message: object) {
  frame?.contentWindow?.postMessage(JSON.stringify(message), YT_ORIGIN);
}

/**
 * Scheda di anteprima: fotogramma del titolo, sopra il trailer italiano ufficiale che
 * parte muto in loop, sotto le info. Montata in un portal dal `PreviewLayer`, che le
 * passa la posizione già calcolata.
 *
 * Il trailer è **ritagliato** (`trailerCoverBox`): il riquadro resta pieno e le bande
 * nere di YouTube restano fuori. È l'opposto della scheda titolo, dove il trailer si
 * deve vedere intero.
 */
export function PreviewCard({
  data,
  width,
  left,
  top,
  allowVideo,
  onMeasure,
}: {
  data: PreviewPayload;
  /** Larghezza scelta dalla finestra (`previewWidth`). */
  width: number;
  left: number;
  top: number;
  allowVideo: boolean;
  /** Altezza reale della scheda, per riposizionarla senza sbordare. */
  onMeasure?: (height: number) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [muted, setMuted] = useState(true);
  const trailer = allowVideo ? data.trailer : null;

  useEffect(() => {
    const height = cardRef.current?.offsetHeight;
    if (height) onMeasure?.(height);
  }, [data, onMeasure]);

  // il player risponde a "listening" con onStateChange (info 1 = playing) e infoDelivery
  useEffect(() => {
    if (!trailer) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onMessage(event: MessageEvent) {
      if (event.origin !== YT_ORIGIN || typeof event.data !== "string") return;
      let payload: { event?: string; info?: unknown };
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      const playing =
        (payload.event === "onStateChange" && payload.info === 1) ||
        (payload.event === "infoDelivery" &&
          (payload.info as { playerState?: number } | undefined)?.playerState === 1);
      if (playing && !timer) timer = setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
    }
    window.addEventListener("message", onMessage);
    // l'iframe può aver già caricato prima di questo effetto: si saluta comunque
    ytPost(frameRef.current, { event: "listening", id: "preview-trailer" });
    return () => {
      window.removeEventListener("message", onMessage);
      if (timer) clearTimeout(timer);
    };
  }, [trailer]);

  const media = mediaHeight(width);
  // da 1600px in su la scheda è grande: titolo e trama salgono di un gradino
  const grande = width >= 600;
  const cover = trailer ? trailerCoverBox(trailer.frame, { width, height: media }) : null;

  const src = trailer
    ? `${YT_ORIGIN}/embed/${trailer.key}?` +
      new URLSearchParams({
        autoplay: "1",
        mute: "1",
        controls: "0",
        loop: "1",
        playlist: trailer.key,
        playsinline: "1",
        rel: "0",
        modestbranding: "1",
        iv_load_policy: "3",
        disablekb: "1",
        enablejsapi: "1",
      }).toString()
    : null;

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      style={{ left, top, width }}
      data-preview-card
      className="fixed z-50 overflow-hidden rounded-[20px] border border-border bg-surface shadow-[0_30px_80px_rgba(0,0,0,0.75)]"
    >
      <div className="relative overflow-hidden bg-surface-2" style={{ height: media }}>
        {data.backdrop && (
          <Image
            src={data.backdrop}
            alt=""
            fill
            sizes={`${width}px`}
            className="object-cover"
          />
        )}
        {src && cover && (
          <iframe
            ref={frameRef}
            src={src}
            title={`Trailer di ${data.title}`}
            allow="autoplay; encrypted-media"
            tabIndex={-1}
            aria-hidden="true"
            onLoad={() =>
              ytPost(frameRef.current, { event: "listening", id: "preview-trailer" })
            }
            style={{
              width: cover.width * YT_SCALE,
              height: cover.height * YT_SCALE,
              left: cover.left,
              top: cover.top,
              transform: `scale(${1 / YT_SCALE})`,
              transformOrigin: "top left",
            }}
            className={`pointer-events-none absolute border-0 transition-opacity duration-500 ${
              revealed ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.85)_100%)]" />

        {revealed && (
          <button
            type="button"
            aria-label={muted ? "Attiva l'audio" : "Disattiva l'audio"}
            onClick={(e) => {
              e.preventDefault();
              ytPost(frameRef.current, {
                event: "command",
                func: muted ? "unMute" : "mute",
                args: [],
              });
              setMuted(!muted);
            }}
            className="glass absolute bottom-3 right-3 z-10 flex size-10 items-center justify-center rounded-full"
          >
            <Speaker muted={muted} />
          </button>
        )}
      </div>

      <div className={`relative ${grande ? "p-6" : "p-5"}`}>
        <p
          className={`line-clamp-1 font-bold tracking-[-0.025em] ${
            grande ? "text-[24px]" : "text-[20px]"
          }`}
        >
          {data.title}
        </p>
        <div
          className={`mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-muted ${
            grande ? "text-[14px]" : "text-[13px]"
          }`}
        >
          {data.vote != null && (
            <span className="font-semibold text-accent-soft">★ {data.vote}</span>
          )}
          {data.year && <span>{data.year}</span>}
          {data.meta && <span>{data.meta}</span>}
          {data.genres.length > 0 && <span>{data.genres.join(" · ")}</span>}
        </div>
        {data.overview && (
          <p
            className={`mt-3 line-clamp-3 leading-[1.5] text-white/75 ${
              grande ? "text-[15px]" : "text-[14px]"
            }`}
          >
            {data.overview}
          </p>
        )}
        {data.providers.length > 0 && (
          <div className="mt-4 flex gap-2">
            {data.providers.map((p) =>
              p.logo ? (
                <Image
                  key={p.id}
                  src={p.logo}
                  alt={p.name}
                  title={p.name}
                  width={32}
                  height={32}
                  className={`rounded-lg border border-black/50 ${grande ? "size-8" : "size-7"}`}
                />
              ) : null,
            )}
          </div>
        )}
      </div>

      {/* tutta la scheda porta al titolo; sta sotto il bottone dell'audio */}
      <Link href={data.href} aria-label={data.title} className="absolute inset-0" />
    </motion.div>
  );
}

function Speaker({ muted }: { muted: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
      {muted ? (
        <path d="m16 9.5 4 5m0-5-4 5" />
      ) : (
        <>
          <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
          <path d="M18 6.8a7.5 7.5 0 0 1 0 10.4" />
        </>
      )}
    </svg>
  );
}
