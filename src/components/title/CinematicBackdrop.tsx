"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { preconnect } from "react-dom";
import { GlassIconButton } from "@/components/layout/GlassIconButton";

const YT_ORIGIN = "https://www.youtube-nocookie.com";

/** Quanto del suo riquadro il fondale scorre (verso il basso) mentre la pagina sale. */
const PARALLAX_RATIO = 0.2;

/**
 * Ritardo tra il "playing" di YouTube e la dissolvenza: nei primi secondi il player
 * mostra i propri controlli centrali (anche con `controls=0`, e di nuovo a ogni
 * comando come `unMute`), che così restano nascosti dietro l'immagine. I controlli
 * svaniscono dopo ~3 s: la dissolvenza (1 s) parte a 2,5 s, quando sono già in uscita.
 */
const REVEAL_DELAY_MS = 2500;

/**
 * Il fondale si mostra solo quando YouTube riporta almeno hd1080 (o la qualità più alta
 * del video, se inferiore): l'ABR parte sempre da `tiny` (144p) e sale a 1080p dopo
 * 0–6 s, e un trailer sgranato non deve mai comparire. Oltre questo tempo dal "playing" si mostra
 * comunque (vale sopra l'attesa minima `REVEAL_DELAY_*`).
 */
const MAX_QUALITY_WAIT_MS = 12000;

/**
 * YouTube annuncia la qualità nuova 2–4 s prima che i fotogrammi HD arrivino a schermo
 * (finisce prima il buffer già scaricato a bassa qualità): la dissolvenza aspetta
 * questo assestamento dopo il raggiungimento della qualità.
 */
const QUALITY_SETTLE_MS = 2500;

/** Livelli di qualità di YouTube, dal più basso; "auto" non è un livello. */
const QUALITY_RANK = [
  "tiny",
  "small",
  "medium",
  "large",
  "hd720",
  "hd1080",
  "hd1440",
  "hd2160",
  "highres",
];

/**
 * Nella banda 16:9 (sotto `lg`) il frame è esattamente il riquadro: barra del titolo e
 * barra "Altri video" di YouTube sono dentro l'area visibile finché il player non le
 * nasconde da solo (~3–4 s dal "playing"). La dissolvenza aspetta che siano sparite.
 */
const REVEAL_DELAY_BAND_MS = 4500;

/** Da `lg` il fondale sporge (barre YouTube fuori vista); sotto è la banda 16:9 esatta. */
function isWideLayout(): boolean {
  return window.matchMedia("(min-width: 1024px)").matches;
}

/** Origini contattate dal player: aperte in anticipo, così il trailer parte prima. */
const YT_PRECONNECT = [YT_ORIGIN, "https://www.youtube.com", "https://i.ytimg.com"];

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

/** Handshake dell'IFrame API: da qui in poi YouTube manda onReady/onStateChange/infoDelivery. */
function ytListen(frame: HTMLIFrameElement | null) {
  frame?.contentWindow?.postMessage(
    JSON.stringify({ event: "listening", id: "cinematic-trailer" }),
    YT_ORIGIN,
  );
}

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
 * (`rankTrailers`: solo IT se ne esiste almeno uno, altrimenti EN): se YouTube
 * rifiuta un video (errore 100/101/150: rimosso, o embed vietato) si passa al
 * successivo della stessa lista; finita la lista resta l'immagine.
 * Con `prefers-reduced-motion` o Save-Data il player viene tolto al mount (l'iframe è
 * nell'HTML del server per partire prima: vedi `allowVideo`).
 *
 * Audio: l'autoplay deve partire muto (regola dei browser). Se l'utente è arrivato
 * qui con un tap (attivazione utente) o ha già scelto l'audio in questa sessione,
 * il player viene smutato appena appare; in ogni caso c'è il bottone altoparlante.
 * Qualità: frame molto più grande del riquadro (vedi sotto), più `vq=highres` e
 * `setPlaybackQuality("highres")` come suggerimento; la dissolvenza aspetta comunque che
 * YouTube riporti almeno hd1080 (o il massimo del video, se inferiore): `atBestQuality`.
 *
 * Due geometrie. Sotto `lg` il riquadro è una **banda 16:9 a tutta larghezza** (come la
 * scheda titolo di Netflix su telefono): immagine e trailer sono interi, mai ritagliati,
 * niente parallasse né zoom; il player è esattamente la banda, a 5× (`scale-[0.2]`):
 * su un telefono da 390px il layout del player è 1950px, quanto basta perché YouTube
 * scelga hd1080 (al doppio sceglieva 360p).
 * Da `lg` il riquadro è il fondale alto della scheda: il contenitore è alto il 120% e
 * sporge in alto, la parallasse lo trasla verso il basso di al più quel 20% (mai un
 * buco); il frame del player copre il riquadro (16:9) ed è più alto di 160px, così
 * titolo e barra del player restano fuori; qui il player è al doppio (`lg:scale-50`).
 * YouTube sceglie la qualità dalla dimensione di layout del player (non dal DPR), per
 * questo il frame è sempre molto più grande di quanto si vede.
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
  /**
   * Parte `true`: l'iframe è già nell'HTML del server, così il browser scarica il player
   * YouTube durante il parse della pagina, prima dell'idratazione (mezzo secondo e più
   * guadagnato sull'avvio). Con `prefers-reduced-motion` o Save-Data viene tolto al mount.
   */
  const [allowVideo, setAllowVideo] = useState(true);
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
  /** Istante del primo "playing" del candidato corrente (0: non ancora) e attesa minima. */
  const playingAtRef = useRef(0);
  const minDelayRef = useRef(REVEAL_DELAY_MS);
  /** Qualità corrente e migliore disponibile riportate da YouTube (infoDelivery). */
  const qualityRef = useRef<string | null>(null);
  const bestQualityRef = useRef<string | null>(null);
  const qualityTimer = useRef<number>(0);
  /** Istante in cui la qualità è arrivata al livello richiesto (0: non ancora). */
  const bestAtRef = useRef(0);
  const revealedRef = useRef(false);

  // handshake TCP/TLS con YouTube durante l'idratazione, prima che l'iframe esista
  if (trailerKey) for (const origin of YT_PRECONNECT) preconnect(origin);

  useEffect(() => {
    if (!trailerKey) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
        ?.saveData === true;
    if (mq.matches || saveData) setAllowVideo(false);
  }, [trailerKey]);

  // parallasse (solo da lg, dove il contenitore sporge del 20%): il fondale scende
  // di PARALLAX_RATIO × scroll, fino a un riquadro. Nella banda mobile non c'è
  // sporgenza: traslare scoprirebbe il fondo.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!isWideLayout()) return;
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

    function reveal() {
      if (revealedRef.current) return;
      revealedRef.current = true;
      window.clearTimeout(revealTimer.current);
      window.clearTimeout(qualityTimer.current);
      qualityTimer.current = 0;
      setRevealed(true);
    }

    /**
     * Vero quando la qualità riportata è almeno hd1080, o la massima disponibile per il
     * video se è inferiore. Sopra hd1080 il player sale da solo dopo la dissolvenza.
     */
    function atBestQuality(): boolean {
      const q = qualityRef.current;
      if (!q) return false;
      const rank = QUALITY_RANK.indexOf(q);
      const hd = QUALITY_RANK.indexOf("hd1080");
      const best = bestQualityRef.current ? QUALITY_RANK.indexOf(bestQualityRef.current) : hd;
      return rank >= 0 && rank >= Math.min(best, hd);
    }

    /**
     * Mostra il trailer quando suona da almeno l'attesa minima ed è alla qualità
     * richiesta da almeno QUALITY_SETTLE_MS; se manca tempo, si riprogramma.
     */
    function tryReveal() {
      if (revealedRef.current || playingAtRef.current === 0) return;
      if (!atBestQuality()) return;
      if (bestAtRef.current === 0) bestAtRef.current = Date.now();
      const due = Math.max(
        playingAtRef.current + minDelayRef.current,
        bestAtRef.current + QUALITY_SETTLE_MS,
      );
      // -50: il timer può scattare qualche ms prima della scadenza nominale
      const wait = due - Date.now();
      if (wait <= 50) {
        reveal();
        return;
      }
      window.clearTimeout(revealTimer.current);
      revealTimer.current = window.setTimeout(tryReveal, wait);
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
          ? (data.info as
              | {
                  playerState?: number;
                  muted?: boolean;
                  playbackQuality?: string;
                  availableQualityLevels?: string[];
                }
              | undefined)
          : undefined;
      if (typeof info?.muted === "boolean") mutedRef.current = info.muted;
      if (typeof info?.playbackQuality === "string") {
        qualityRef.current = info.playbackQuality;
      }
      if (Array.isArray(info?.availableQualityLevels)) {
        // lista decrescente, "auto" in coda
        bestQualityRef.current =
          info.availableQualityLevels.find((l) => l !== "auto") ?? null;
      }
      if (info) tryReveal();
      if (data.event === "onError" && EMBED_ERRORS.has(Number(data.info))) {
        // video rimosso o embed vietato: si prova il candidato successivo
        window.clearTimeout(revealTimer.current);
        revealTimer.current = 0;
        window.clearTimeout(unmuteTimer.current);
        unmuteTimer.current = 0;
        window.clearTimeout(retryTimer.current);
        retryTimer.current = 0;
        mutedRef.current = null;
        window.clearTimeout(qualityTimer.current);
        qualityTimer.current = 0;
        playingAtRef.current = 0;
        qualityRef.current = null;
        bestQualityRef.current = null;
        bestAtRef.current = 0;
        revealedRef.current = false;
        setRevealed(false);
        setKeyIndex((i) => i + 1);
        return;
      }
      const state = data.event === "onStateChange" ? data.info : info?.playerState;
      if (state === 1 && revealTimer.current === 0) {
        ytCommand(frameRef.current, "setPlaybackQuality", ["highres"]);
        // niente sottotitoli automatici sul fondale (alcuni trailer li accendono da soli)
        ytCommand(frameRef.current, "setOption", ["captions", "track", {}]);
        ytCommand(frameRef.current, "unloadModule", ["captions"]);
        ytCommand(frameRef.current, "unloadModule", ["cc"]);
        // audio subito, a frame ancora nascosto: il flash dei controlli non si vede
        const wantSound = soundPreference ?? hasUserActivation();
        if (wantSound && !autoUnmuteBlocked) unmuteAuto();
        playingAtRef.current = Date.now();
        minDelayRef.current = isWideLayout() ? REVEAL_DELAY_MS : REVEAL_DELAY_BAND_MS;
        revealTimer.current = window.setTimeout(tryReveal, minDelayRef.current);
        qualityTimer.current = window.setTimeout(reveal, MAX_QUALITY_WAIT_MS);
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
      window.clearTimeout(qualityTimer.current);
      window.clearTimeout(unmuteTimer.current);
      window.clearTimeout(retryTimer.current);
    };
  }, [allowVideo]);

  // l'iframe arriva dal server e può aver già finito di caricare prima dell'idratazione:
  // il suo `onLoad` React non scatterebbe, quindi l'handshake si manda anche qui
  useEffect(() => {
    if (!allowVideo || !trailerKey) return;
    ytListen(frameRef.current);
  }, [allowVideo, trailerKey]);

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
        vq: "highres",
        // niente `origin`: l'URL deve essere identico tra server e client (idratazione)
      }).toString()
    : null;

  return (
    <>
      <div
        ref={layerRef}
        className="absolute inset-0 overflow-hidden will-change-transform lg:-top-[20%]"
      >
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            priority
            quality={95}
            // sizes dalla geometria cover: sotto lg la banda è 16:9 come l'immagine
            // (100vw esatti); da lg l'immagine deve essere larga quanto l'altezza del
            // layer × 16/9, cioè più della pagina sugli schermi meno larghi
            sizes="(max-width: 1023px) 100vw, (max-width: 1439px) 115vw, 100vw"
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
            onLoad={() => ytListen(frameRef.current)}
            className={`pointer-events-none absolute left-1/2 top-1/2 h-[500%] w-[500%] -translate-x-1/2 -translate-y-1/2 scale-[0.2] border-0 transition-opacity duration-1000 lg:aspect-video lg:h-auto lg:w-auto lg:min-h-[calc(200%+320px)] lg:min-w-[200%] lg:scale-50 ${
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
