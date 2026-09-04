"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { GlassIconButton } from "@/components/layout/GlassIconButton";

const YT_ORIGIN = "https://www.youtube-nocookie.com";

/** Quanto del suo riquadro il fondale scorre (verso il basso) mentre la pagina sale. */
const PARALLAX_RATIO = 0.2;

/**
 * Ritardo tra il "playing" di YouTube e la dissolvenza: nei primi secondi il player
 * mostra i propri controlli centrali (anche con `controls=0`, e di nuovo a ogni
 * comando come `unMute`), che così restano nascosti dietro l'immagine.
 */
const REVEAL_DELAY_MS = 4000;

/** Dopo un `unMute` senza gesto, iOS può mettere in pausa: entro questo tempo si ripiega. */
const UNMUTE_GRACE_MS = 1500;

/**
 * Appena parte, il player ignora i comandi per qualche istante: se dopo questo
 * tempo YouTube riporta ancora `muted`, l'`unMute` viene ripetuto (frame ancora nascosto).
 */
const UNMUTE_RETRY_MS = 1200;

/**
 * Codici `onError` dell'IFrame API per cui ha senso passare al candidato successivo:
 * 100 video rimosso/privato, 101 e 150 embed vietato dal proprietario.
 */
const EMBED_ERRORS = new Set([100, 101, 150]);

/**
 * Scelta audio dell'utente in questa sessione (sopravvive alle navigazioni client):
 * `null` finché non tocca il bottone. Con `true` le schede successive partono con l'audio.
 */
let soundPreference: boolean | null = null;

/** Se il browser ha rifiutato un `unMute` automatico, non si riprova senza un gesto. */
let autoUnmuteBlocked = false;

function ytCommand(frame: HTMLIFrameElement | null, func: string, args: unknown[] = []) {
  frame?.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func, args }),
    YT_ORIGIN,
  );
}

/** L'utente ha già interagito con la pagina (es. tap su una card): l'audio è permesso. */
function hasUserActivation(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation;
  return ua?.hasBeenActive === true;
}

/**
 * Fondale cinematografico di scheda titolo e stagione: immagine sempre presente,
 * con lento zoom (Ken Burns) e parallasse allo scroll; sopra, se c'è un trailer
 * YouTube, il player in loop che sfuma in dissolvenza solo quando YouTube conferma
 * (via postMessage dell'IFrame API, senza caricare script esterni) che sta davvero
 * riproducendo. `trailerKeys` è la lista dei candidati in ordine di preferenza
 * (`rankTrailers`): se YouTube rifiuta un video (errore 100/101/150: rimosso, o embed
 * vietato dal proprietario, tipico dei trailer italiani di Sky/HBO) si passa al
 * successivo; finita la lista resta l'immagine.
 * Con `prefers-reduced-motion` o Save-Data il player non viene neanche caricato.
 *
 * Audio: l'autoplay deve partire muto (regola dei browser). Se l'utente è arrivato
 * qui con un tap (attivazione utente) o ha già scelto l'audio in questa sessione,
 * il player viene smutato appena appare; in ogni caso c'è il bottone altoparlante.
 * Qualità: frame al doppio della dimensione (vedi sotto), più `vq=hd1080` e
 * `setPlaybackQuality` come suggerimento.
 *
 * Il contenitore è alto il 120% del riquadro e sporge in alto: la parallasse lo
 * trasla verso il basso di al più quel 20%, così non scopre mai il fondo.
 * Il frame del player copre il riquadro (16:9) ed è più alto di 160px, così titolo
 * e barra del player restano fuori; è renderizzato al doppio e ridotto con
 * `scale-50`: YouTube sceglie la qualità dalla dimensione di layout del player,
 * così serve 1080p anche dove il riquadro è piccolo (mobile).
 */
export function CinematicBackdrop({
  image,
  trailerKeys,
  blurred = false,
  label = "Trailer",
  soundButtonClassName = "right-[68px] lg:right-[88px]",
}: {
  image: string | null;
  /** Chiavi YouTube candidate, dalla preferita in giù (vuoto: solo immagine). */
  trailerKeys: string[];
  /** Fallback povero (poster): sfocato e desaturato come nel mockup. */
  blurred?: boolean;
  /** Titolo accessibile dell'iframe. */
  label?: string;
  /** Posizione orizzontale del bottone audio (di default a sinistra di "Condividi"). */
  soundButtonClassName?: string;
}) {
  const [allowVideo, setAllowVideo] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [sound, setSound] = useState(false);
  /** Indice del candidato in riproduzione; avanza a ogni errore di YouTube. */
  const [keyIndex, setKeyIndex] = useState(0);
  const trailerKey = trailerKeys[keyIndex] ?? null;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const revealTimer = useRef<number>(0);
  const unmuteTimer = useRef<number>(0);
  const retryTimer = useRef<number>(0);
  /** Ultimo `muted` riportato da YouTube (infoDelivery). */
  const mutedRef = useRef<boolean | null>(null);

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
  // (info 1 = playing, 2 = paused) e infoDelivery ({ playerState })
  useEffect(() => {
    if (!allowVideo) return;

    function unmuteAuto(attempt = 0) {
      const frame = frameRef.current;
      ytCommand(frame, "unMute");
      ytCommand(frame, "setVolume", [100]);
      setSound(true);
      // senza gesto: se entro poco YouTube va in pausa, l'audio è stato rifiutato
      window.clearTimeout(unmuteTimer.current);
      unmuteTimer.current = window.setTimeout(() => {
        unmuteTimer.current = 0;
      }, UNMUTE_GRACE_MS);
      // il comando può cadere nel vuoto subito dopo il "playing": si riprova
      window.clearTimeout(retryTimer.current);
      retryTimer.current = window.setTimeout(() => {
        retryTimer.current = 0;
        if (mutedRef.current !== false && attempt < 2 && !autoUnmuteBlocked) {
          unmuteAuto(attempt + 1);
        }
      }, UNMUTE_RETRY_MS);
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== YT_ORIGIN || typeof event.data !== "string") return;
      let data: { event?: string; info?: unknown };
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      const info =
        data.event === "infoDelivery"
          ? (data.info as { playerState?: number; muted?: boolean } | undefined)
          : undefined;
      if (typeof info?.muted === "boolean") mutedRef.current = info.muted;
      if (data.event === "onError" && EMBED_ERRORS.has(Number(data.info))) {
        // video rimosso o embed vietato: si prova il candidato successivo
        window.clearTimeout(revealTimer.current);
        revealTimer.current = 0;
        window.clearTimeout(unmuteTimer.current);
        unmuteTimer.current = 0;
        window.clearTimeout(retryTimer.current);
        retryTimer.current = 0;
        mutedRef.current = null;
        setRevealed(false);
        setKeyIndex((i) => i + 1);
        return;
      }
      const state = data.event === "onStateChange" ? data.info : info?.playerState;
      if (state === 1 && revealTimer.current === 0) {
        ytCommand(frameRef.current, "setPlaybackQuality", ["hd1080"]);
        // audio subito, a frame ancora nascosto: il flash dei controlli non si vede
        const wantSound = soundPreference ?? hasUserActivation();
        if (wantSound && !autoUnmuteBlocked) unmuteAuto();
        revealTimer.current = window.setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
      }
      if (state === 2 && unmuteTimer.current !== 0) {
        // unMute automatico rifiutato (iOS): si torna muti e si riparte
        window.clearTimeout(unmuteTimer.current);
        unmuteTimer.current = 0;
        autoUnmuteBlocked = true;
        ytCommand(frameRef.current, "mute");
        ytCommand(frameRef.current, "playVideo");
        setSound(false);
      }
    }
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(revealTimer.current);
      window.clearTimeout(unmuteTimer.current);
      window.clearTimeout(retryTimer.current);
    };
  }, [allowVideo]);

  function toggleSound() {
    const next = !sound;
    soundPreference = next;
    const frame = frameRef.current;
    window.clearTimeout(retryTimer.current);
    retryTimer.current = 0;
    if (next) {
      // gesto reale: l'audio è sempre permesso
      autoUnmuteBlocked = false;
      ytCommand(frame, "unMute");
      ytCommand(frame, "setVolume", [100]);
    } else {
      ytCommand(frame, "mute");
    }
    setSound(next);
  }

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
        vq: "hd1080",
        origin: typeof window === "undefined" ? "" : window.location.origin,
      }).toString()
    : null;

  return (
    <>
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
            // sizes dalla geometria cover: l'immagine 16:9 deve essere larga quanto
            // l'altezza del layer × 16/9, su mobile ~3 viewport → next/image sceglie
            // l'original invece del file da 1200px (che scalato 3× è sfocato)
            sizes="(max-width: 767px) 290vw, (max-width: 1023px) 150vw, (max-width: 1439px) 115vw, 100vw"
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
            key={trailerKey}
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
            className={`pointer-events-none absolute left-1/2 top-1/2 aspect-video min-h-[calc(200%+320px)] min-w-[200%] -translate-x-1/2 -translate-y-1/2 scale-50 border-0 transition-opacity duration-1000 ${
              revealed ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
      </div>

      {revealed && (
        <GlassIconButton
          label={sound ? "Disattiva audio del trailer" : "Attiva audio del trailer"}
          onClick={toggleSound}
          className={`absolute top-[calc(env(safe-area-inset-top,0px)+92px)] z-20 ${soundButtonClassName}`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M11 5 6 9H3v6h3l5 4z" />
            {sound ? (
              <>
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M18.5 5.5a9 9 0 0 1 0 13" />
              </>
            ) : (
              <path d="m16 9 5 6M21 9l-5 6" />
            )}
          </svg>
        </GlassIconButton>
      )}
    </>
  );
}
