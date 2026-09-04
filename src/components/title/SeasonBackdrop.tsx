"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * Sfondo del banner stagione: fotogramma della stagione sempre presente; sopra,
 * se la stagione ha un trailer YouTube, il player muto in loop che sfuma in
 * dissolvenza quando è pronto. Con `prefers-reduced-motion` il player non
 * viene neanche caricato. Il frame è scalato per coprire il riquadro (16:9) e
 * più alto di 160px, così titolo e barra del player restano fuori dal riquadro.
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!trailerKey) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
        ?.saveData === true;
    setAllowVideo(!mq.matches && !saveData);
  }, [trailerKey]);

  return (
    <>
      {image ? (
        <Image
          src={image}
          alt=""
          fill
          priority
          quality={95}
          sizes="(min-width: 1024px) calc(100vw - 240px), 100vw"
          className={
            blurred
              ? "scale-[1.3] object-cover object-[50%_30%] opacity-70 blur-[24px]"
              : "origin-[50%_20%] scale-110 object-cover"
          }
        />
      ) : (
        <div className="h-full w-full bg-surface" />
      )}

      {trailerKey && allowVideo && (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailerKey}&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1`}
          title="Trailer della stagione"
          allow="autoplay; encrypted-media"
          tabIndex={-1}
          aria-hidden="true"
          onLoad={() => {
            // il player parte nero: attendiamo un attimo prima di mostrarlo
            window.setTimeout(() => setReady(true), 1500);
          }}
          className={`pointer-events-none absolute left-1/2 top-1/2 aspect-video min-h-[calc(100%+160px)] min-w-full -translate-x-1/2 -translate-y-1/2 border-0 transition-opacity duration-1000 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </>
  );
}
