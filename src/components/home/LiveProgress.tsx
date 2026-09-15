"use client";

import type { ReactNode } from "react";
import { playbackTime, samePlayingEpisode } from "@/lib/watch/progress";
import { useWatching } from "./WatchingProvider";
import { LiveIndicator } from "./LiveIndicator";
import { usePlaybackPosition } from "./usePlaybackPosition";

/** Chi è questa tessera, per riconoscerla fra le sessioni aperte. */
export interface CardIdentity {
  titleId: number;
  mediaType: "movie" | "tv";
  /** stagione ed episodio mostrati dalla card; null per un film */
  season: number | null;
  episode: number | null;
}

interface Props {
  identity: CardIdentity;
  /** Cosa ha reso il server: resta quello quando non c'è niente in corso. */
  positionMs: number | null;
  durationMs: number | null;
  /**
   * L'angolo in alto a destra è già occupato (il bottone "Guarda sulla TV"):
   * il segno "Ora" va in cima al centro, altrimenti ci finisce sopra.
   */
  angoloOccupato?: boolean;
}

/**
 * Ultima misura effettiva della sessione, oppure punto persistente dalla libreria.
 * Il punto persistente resta separato dall'avanzamento visivo durante playing.
 */
function useCardSession(identity: CardIdentity) {
  const sessions = useWatching();
  return sessions.find(
    (s) =>
      s.titleId === identity.titleId &&
      s.mediaType === identity.mediaType &&
      // Stessa regola del server, stesso file puro: la stagione puo' essere
      // sconosciuta (Netflix la espone solo dal pannello di pausa), l'episodio no.
      samePlayingEpisode(
        { season: identity.season, episode: identity.episode },
        { season: s.seasonNumber, episode: s.episodeNumber },
      ),
  );
}

/** Il Play torna disponibile in pausa o quando la sessione live termina. */
export function LivePlay({
  identity,
  children,
}: {
  identity: CardIdentity;
  children: ReactNode;
}) {
  const session = useCardSession(identity);
  return session?.state === "playing" ? null : children;
}

export function LiveProgress({
  identity,
  positionMs,
  durationMs,
  angoloOccupato = false,
}: Props) {
  const viva = useCardSession(identity);
  const livePosition = usePlaybackPosition(viva);

  // La posizione viene dalla sessione viva quando c'e': e' lei che scorre.
  //
  // La **durata** invece si completa con quella salvata quando la sessione non
  // la conosce. Prima no — "non si mescolano due fonti" — ma il risultato era
  // una tessera con un numero nudo: niente barra, niente durata a destra,
  // perche' Netflix e Prime non pubblicano mai la durata totale. Visto il
  // 13/09 su una serie rimasta in riproduzione. Le due misure parlano dello
  // stesso episodio per costruzione (e' `useCardSession` a dirlo), quindi il
  // rischio e' che la barra sia tarata su una durata leggermente diversa —
  // molto meno grave di una tessera che sembra rotta.
  const posizione = viva ? livePosition : positionMs;
  const durata = viva ? (viva.durationMs ?? durationMs) : durationMs;
  const corrente = playbackTime(posizione);
  const totale = durata !== null && durata > 0 ? playbackTime(durata) : null;
  if (!corrente) return null;
  const quota =
    totale && posizione !== null && durata !== null
      ? Math.min(1, Math.max(0, posizione / durata))
      : null;
  const percentuale = quota === null ? null : quota * 100;

  return (
    <>
      {viva && (viva.state === "playing" || viva.state === "paused") && (
        <div
          className={
            viva.state === "playing" && !angoloOccupato
              ? "pointer-events-none absolute right-2.5 top-2.5 flex h-9 items-center"
              : "pointer-events-none absolute inset-x-14 top-3 flex justify-center"
          }
        >
          <LiveIndicator state={viva.state} />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 text-white lg:inset-x-4 lg:bottom-3.5">
        {percentuale !== null && (
          <div
            role="progressbar"
            aria-label="Punto di ripresa"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percentuale)}
            aria-valuetext={`${corrente} di ${totale}`}
            className="relative mb-2.5 h-[3px] rounded-full bg-white/30"
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-accent-light"
              style={{ width: `${percentuale}%` }}
            />
            <span
              aria-hidden="true"
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_2px_rgba(0,0,0,0.16)]"
              style={{ left: `${percentuale}%` }}
            />
          </div>
        )}
        <div className="flex items-baseline justify-between text-[12px] font-medium leading-none tabular-nums drop-shadow lg:text-[13px]">
          <span aria-label={`Riprendi da ${corrente}`}>{corrente}</span>
          {totale && (
            <span className="text-white/75" aria-label={`Durata totale ${totale}`}>
              {totale}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
