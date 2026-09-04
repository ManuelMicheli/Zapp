"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const YT_ORIGIN = "https://www.youtube-nocookie.com";

/** Quanto del suo riquadro il fondale scorre (verso il basso) mentre la pagina sale. */
const PARALLAX_RATIO = 0.2;

/**
 * Fondale cinematografico di scheda titolo e stagione: immagine sempre presente,
 * con lento zoom (Ken Burns) e parallasse allo scroll; sopra, se c'è un trailer
 * YouTube, il player muto in loop che sfuma in dissolvenza solo quando YouTube
 * conferma (via postMessage dell'IFrame API, senza caricare script esterni) che
 * sta davvero riproducendo: un trailer con embed disabilitato o non disponibile
 * lascia l'immagine. Con `prefers-reduced-motion` o Save-Data il player non viene
 * neanche caricato e zoom/parallasse restano fermi.
 *
 * Il contenitore è alto il 120% del riquadro e sporge in alto: la parallasse lo
 * trasla verso il basso di al più quel 20%, così non scopre mai il fondo.
 * Il frame del player copre il riquadro (16:9) ed è più alto di 160px, così titolo
 * e barra del player restano fuori.
 */
export function CinematicBackdrop({
  image,
  trailerKey,
  blurred = false,
  label = "Trailer",
}: {
  image: string | null;
  trailerKey: string | null;
  /** Fallback povero (poster): sfocato e desaturato come nel mockup. */
  blurred?: boolean;
  /** Titolo accessibile dell'iframe. */
  label?: string;
}) {
  const [allowVideo, setAllowVideo] = useState(false);
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!trailerKey) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
        ?.saveData === true;
    setAllowVideo(!mq.matches && !saveData);
  }, [trailerKey]);

  // parallasse: il fondale scende di PARALLAX_RATIO × scroll, fino a un riquadro
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = layer.parentElement;
    let raf = 0;
    function update() {
      raf = 0;
      if (!layer || !box) return;
      const limit = box.offsetHeight;
      const y = Math.min(Math.max(window.scrollY, 0), limit) * PARALLAX_RATIO;
      layer.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    }
    function onScroll() {
      if (raf === 0) raf = requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, []);

  // stato del player: YouTube risponde a "listening" con eventi onStateChange
  // (info 1 = playing) e infoDelivery ({ playerState })
  useEffect(() => {
    if (!allowVideo) return;
    function onMessage(event: MessageEvent) {
      if (event.origin !== YT_ORIGIN || typeof event.data !== "string") return;
      let data: { event?: string; info?: unknown };
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      const state =
        data.event === "onStateChange"
          ? data.info
          : data.event === "infoDelivery"
            ? (data.info as { playerState?: number } | undefined)?.playerState
            : undefined;
      if (state === 1) setPlaying(true);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [allowVideo]);

  const src = trailerKey
    ? `${YT_ORIGIN}/embed/${trailerKey}?` +
      new URLSearchParams({
        autoplay: "1",
        mute: "1",
        controls: "0",
        loop: "1",
        playlist: trailerKey,
        playsinline: "1",
        rel: "0",
        modestbranding: "1",
        iv_load_policy: "3",
        disablekb: "1",
        enablejsapi: "1",
        origin: typeof window === "undefined" ? "" : window.location.origin,
      }).toString()
    : null;

  return (
    <div
      ref={layerRef}
      className="absolute inset-x-0 -top-[20%] bottom-0 overflow-hidden will-change-transform"
    >
      {image ? (
        <Image
          src={image}
          alt=""
          fill
          priority
          quality={95}
          sizes="100vw"
          className={
            blurred
              ? "scale-[1.3] object-cover object-[50%_30%] opacity-70 blur-[24px]"
              : "ken-burns object-cover object-[50%_30%]"
          }
        />
      ) : (
        <div className="h-full w-full bg-surface" />
      )}

      {src && allowVideo && (
        <iframe
          ref={frameRef}
          src={src}
          title={label}
          allow="autoplay; encrypted-media"
          tabIndex={-1}
          aria-hidden="true"
          onLoad={() => {
            frameRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "listening", id: "cinematic-trailer" }),
              YT_ORIGIN,
            );
          }}
          className={`pointer-events-none absolute left-1/2 top-1/2 aspect-video min-h-[calc(100%+160px)] min-w-full -translate-x-1/2 -translate-y-1/2 border-0 transition-opacity duration-1000 ${
            playing ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
