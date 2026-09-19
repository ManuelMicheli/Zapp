"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { segnaVisto } from "@/lib/shorts/actions";
import { copertinaUrl, durataLabel, type ShortFilm } from "@/lib/shorts/shape";

/**
 * Il player di un corto: finche' non si preme play in pagina c'e' solo la copertina.
 *
 * E' una **facciata**, non un iframe nascosto. Un `<iframe>` di YouTube montato
 * subito scarica qualche centinaio di kB e contatta Google prima che l'utente abbia
 * chiesto di vedere qualcosa: qui non succede niente finche' non si tocca il
 * triangolo, e allora parte `youtube-nocookie.com` (l'unico host in `frame-src`
 * nella CSP di `next.config.ts`).
 *
 * "Visto" si accende da solo dopo un minuto di riproduzione — meta' durata per i
 * corti brevissimi — e solo per chi ha un account. Non esiste modo di sapere davvero
 * se il video sta andando: gli eventi di riproduzione arriverebbero dall'IFrame API,
 * che e' uno script servito da `www.youtube.com` e la CSP non lo ammette (e non vale
 * la pena ammetterlo per questo). Quindi e' un timer dal momento del play: chi apre e
 * chiude subito non risulta averlo visto, chi lascia la pagina aperta senza guardare
 * si',  e in quel caso il bottone "Visto" si spegne con un tocco.
 */
export function ShortPlayer({
  corto,
  autenticato,
  giaVisto,
}: {
  corto: ShortFilm;
  autenticato: boolean;
  giaVisto: boolean;
}) {
  const [attivo, setAttivo] = useState(false);
  const [, startTransition] = useTransition();
  const segnato = useRef(giaVisto);

  useEffect(() => {
    if (!attivo || !autenticato || segnato.current) return;
    const attesa = Math.min(60_000, Math.round((corto.durata * 1000) / 2));
    const timer = setTimeout(() => {
      segnato.current = true;
      startTransition(async () => {
        // Se fallisce non c'e' niente da dire all'utente: non l'ha chiesto lui.
        // Il bottone "Visto" resta li' e fa la stessa cosa con un tocco.
        const esito = await segnaVisto(corto.youtubeId);
        if (!esito.ok) segnato.current = false;
      });
    }, attesa);
    return () => clearTimeout(timer);
  }, [attivo, autenticato, corto.durata, corto.youtubeId]);

  // `hl` e `cc_lang_pref`: interfaccia del player e sottotitoli in italiano quando il
  // video li ha. `rel=0` tiene i suggeriti finali dentro allo stesso canale.
  const src = `https://www.youtube-nocookie.com/embed/${corto.youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&hl=it&cc_lang_pref=it`;

  return (
    <div className="relative isolate aspect-video w-full overflow-hidden bg-black lg:rounded-[20px] lg:border lg:border-border">
      {attivo ? (
        <iframe
          src={src}
          title={corto.titolo}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAttivo(true)}
          className="group absolute inset-0 size-full focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent"
        >
          <Image
            src={copertinaUrl(corto)}
            alt=""
            fill
            unoptimized
            priority
            className="object-cover opacity-90 transition-opacity duration-500 group-hover:opacity-100"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/20" />
          <span className="glass-accent absolute left-1/2 top-1/2 flex size-[74px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white transition-transform duration-300 motion-safe:group-hover:scale-110 lg:size-[88px]">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="ml-1"
            >
              <path d="M8 5.5v13l11-6.5-11-6.5Z" />
            </svg>
          </span>
          <span className="glass absolute bottom-3 right-3 rounded-full px-3 py-1 text-[12px] font-semibold tabular-nums">
            {durataLabel(corto.durata)}
          </span>
          <span className="sr-only">Riproduci {corto.titolo}</span>
        </button>
      )}
    </div>
  );
}
