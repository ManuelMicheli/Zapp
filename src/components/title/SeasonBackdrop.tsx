"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const YT_ORIGIN = "https://www.youtube-nocookie.com";

/**
 * Sfondo del banner stagione: fotogramma della stagione sempre presente; sopra,
 * se la stagione ha un trailer YouTube, il player muto in loop che sfuma in
 * dissolvenza solo quando YouTube conferma (via postMessage dell'IFrame API,
 * senza caricare script esterni) che sta davvero riproducendo: un trailer con
 * embed disabilitato o non disponibile lascia il fotogramma. Con
 * `prefers-reduced-motion` o Save-Data il player non viene neanche caricato.
 * Il frame copre il riquadro (16:9) ed è più alto di 160px, così titolo e barra
 * del player restano fuori.
 */
export function SeasonBackdrop({
  image,
  trailerKey,
  blurred = false,
}: {
  image: string | null;
  trailerKey: string | null;
  /** Fallback povero (poster): sfocato e desaturato come nel mockup. */
  blurred?: boolean;
}) {
  const [allowVideo, setAllowVideo] = useState(false);
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!trailerKey) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
        ?.saveData === true;
    setAllowVideo(!mq.matches && !saveData);
  }, [trailerKey]);

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
    <>
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
              : "origin-[50%_20%] scale-110 object-cover"
          }
        />
      ) : (
        <div className="h-full w-full bg-surface" />
      )}

      {src && allowVideo && (
        <iframe
          ref={frameRef}
          src={src}
          title="Trailer della stagione"
          allow="autoplay; encrypted-media"
          tabIndex={-1}
          aria-hidden="true"
          onLoad={() => {
            frameRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "listening", id: "season-trailer" }),
              YT_ORIGIN,
            );
          }}
          className={`pointer-events-none absolute left-1/2 top-1/2 aspect-video min-h-[calc(100%+160px)] min-w-full -translate-x-1/2 -translate-y-1/2 border-0 transition-opacity duration-1000 ${
            playing ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </>
  );
}
