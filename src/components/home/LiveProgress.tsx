"use client";

import { useEffect, useState } from "react";
import { samePlayingEpisode } from "@/lib/watch/progress";
import { useWatching } from "./WatchingProvider";

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
  label: string | null;
  ratio: number | null;
}

/** "18 min di 76", la stessa forma di `resumeLabel`. */
function etichetta(positionMs: number, durationMs: number | null): string {
  const min = Math.max(0, Math.round(positionMs / 60000));
  if (!durationMs) return `${min} min`;
  return `${min} min di ${Math.round(durationMs / 60000)}`;
}

/**
 * Il minutaggio della tessera, che **scorre** mentre si guarda.
 *
 * Fra un battito dell'estensione e l'altro passano 30 secondi: una barra
 * disegnata sulla sola posizione salvata resterebbe ferma mezzo minuto e poi
 * farebbe un salto. Qui si somma il tempo trascorso da quella misura — ma solo
 * mentre lo stato della sessione è `playing`: l'estensione manda un battito
 * ogni 30 s **anche in pausa**, quindi "la posizione è fresca" non vuol dire
 * "il video sta andando", ed è la distinzione che tiene in piedi tutto questo.
 *
 * Senza una sessione in corso per questa tessera si mostrano i valori del
 * server, cioè esattamente quello che si vedeva prima: chi non usa
 * l'estensione non nota nessuna differenza.
 */
export function LiveProgress({ identity, label, ratio }: Props) {
  const sessions = useWatching();
  const viva = sessions.find(
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

  // Un tic al secondo basta: il numero è in minuti e la barra è larga 300px,
  // dove un secondo non si vede. `requestAnimationFrame` qui sarebbe sprecato.
  const [, tic] = useState(0);
  useEffect(() => {
    if (!viva || viva.state !== "playing") return;
    const id = setInterval(() => tic((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [viva]);

  let testo = label;
  let quota = ratio;

  if (viva) {
    const passato =
      viva.state === "playing" ? Math.max(0, Date.now() - Date.parse(viva.at)) : 0;
    const posizione = viva.durationMs
      ? Math.min(viva.positionMs + passato, viva.durationMs)
      : viva.positionMs + passato;
    testo = etichetta(posizione, viva.durationMs);
    quota = viva.durationMs ? Math.min(1, Math.max(0, posizione / viva.durationMs)) : null;
  }

  return (
    <>
      {testo && (
        // `pointer-events-none`: sta sopra al Link che copre tutta la tessera,
        // e senza si mangerebbe il click proprio in quell'angolo.
        <span className="pointer-events-none absolute bottom-[18px] left-3 text-[15px] font-semibold leading-none text-white drop-shadow">
          {testo}
        </span>
      )}
      {quota != null && (
        <div className="pointer-events-none absolute inset-x-3 bottom-2.5 h-[3px] overflow-hidden rounded-full bg-white/25">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
            style={{ width: `${Math.max(2, Math.round(quota * 100))}%` }}
          />
        </div>
      )}
    </>
  );
}
