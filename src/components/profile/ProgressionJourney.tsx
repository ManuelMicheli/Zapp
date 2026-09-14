"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PROGRESSION_LEVELS, type ProfileProgression } from "@/lib/profile/progression";
import styles from "./ProgressionJourney.module.css";

interface Props {
  progression: ProfileProgression;
  profileId: string;
  shared?: boolean;
}

const POSTERS = [
  ["238", "Il padrino"],
  ["157336", "Interstellar"],
  ["27205", "Inception"],
  ["155", "Il cavaliere oscuro"],
  ["680", "Pulp Fiction"],
  ["13", "Forrest Gump"],
  ["550", "Fight Club"],
  ["603", "Matrix"],
  ["105", "Ritorno al futuro"],
  ["769", "Quei bravi ragazzi"],
  ["637", "La vita è bella"],
  ["11216", "Nuovo Cinema Paradiso"],
  ["98", "Il gladiatore"],
  ["120", "Il Signore degli Anelli"],
  ["329", "Jurassic Park"],
  ["78", "Blade Runner"],
  ["11", "Guerre stellari"],
  ["438631", "Dune"],
  ["496243", "Parasite"],
  ["129", "La città incantata"],
  ["569094", "Across the Spider-Verse"],
  ["346", "I sette samurai"],
  ["194", "Il favoloso mondo di Amélie"],
  ["424", "Schindler's List"],
  ["272", "Batman Begins"],
  ["807", "Seven"],
  ["1891", "L'Impero colpisce ancora"],
  ["24428", "The Avengers"],
  ["862", "Toy Story"],
  ["280", "Terminator 2"],
  ["694", "Shining"],
  ["674", "Harry Potter e il calice di fuoco"],
  ["120467", "Grand Budapest Hotel"],
  ["313369", "La La Land"],
  ["786892", "Furiosa"],
  ["545611", "Everything Everywhere All at Once"],
  ["20453", "3 Idiots"],
  ["497", "Il miglio verde"],
  ["389", "La parola ai giurati"],
  ["324857", "Spider-Man: Un nuovo universo"],
] as const;

const DESKTOP_SLOTS = [
  [0, 1],
  [3, 1],
  [3, 6],
  [4, 4],
  [1, 4],
  [2, 7],
  [0, 6],
  [4, 0],
  [2, 2],
  [1, 7],
  [4, 7],
  [0, 3],
  [3, 4],
  [1, 1],
  [2, 5],
  [4, 2],
  [0, 0],
  [3, 7],
  [1, 5],
  [2, 0],
  [4, 6],
  [0, 4],
  [3, 2],
  [1, 2],
  [2, 6],
  [4, 1],
  [0, 7],
  [3, 5],
  [1, 0],
  [2, 3],
  [4, 5],
  [0, 2],
  [3, 0],
  [1, 6],
  [2, 1],
  [4, 3],
  [0, 5],
  [3, 3],
  [1, 3],
  [2, 4],
] as const;

const MOBILE_SLOTS = [
  [0, 1],
  [3, 0],
  [5, 4],
  [7, 2],
  [2, 3],
  [6, 0],
  [1, 4],
  [4, 2],
  [7, 4],
  [0, 3],
  [5, 1],
  [2, 0],
  [6, 3],
  [3, 2],
  [1, 1],
  [4, 4],
  [7, 0],
  [0, 0],
  [5, 3],
  [2, 2],
  [6, 1],
  [3, 4],
  [1, 3],
  [4, 1],
  [7, 3],
  [0, 4],
  [5, 0],
  [2, 4],
  [6, 2],
  [3, 1],
  [1, 0],
  [4, 3],
  [7, 1],
  [0, 2],
  [5, 2],
  [2, 1],
  [6, 4],
  [3, 3],
  [1, 2],
  [4, 0],
] as const;

/** Baseline volatile: sopravvive ai remount SPA, mai al reload e mai su disco. */
const attainedRankByProfile = new Map<string, number>();

function rankIndexFor(progression: ProfileProgression) {
  return PROGRESSION_LEVELS.findIndex(
    (candidate) => candidate.name === progression.level.name,
  );
}

export function ProgressionJourney({ progression, profileId, shared = false }: Props) {
  const attainedRank = rankIndexFor(progression);
  const [viewedRank, setViewedRank] = useState(attainedRank);
  const [fromUnlockCount, setFromUnlockCount] = useState(
    PROGRESSION_LEVELS[attainedRank].unlockCount,
  );
  const [snapToBaseline, setSnapToBaseline] = useState(false);
  useEffect(() => {
    setSnapToBaseline(false);
    if (shared) {
      setFromUnlockCount(PROGRESSION_LEVELS[viewedRank].unlockCount);
      setViewedRank(attainedRank);
      return undefined;
    }
    const previous = attainedRankByProfile.get(profileId);
    if (previous === undefined) {
      attainedRankByProfile.set(profileId, attainedRank);
      return undefined;
    }
    if (attainedRank !== previous) {
      if (viewedRank === attainedRank) {
        // Dopo un remount React nasce sul valore reale per mantenere SSR e hydration
        // identici. Prima del frame successivo torna alla baseline volatile, poi
        // applica il nuovo rango: solo le nuove facce cambiano trasformazione.
        setSnapToBaseline(true);
        setFromUnlockCount(PROGRESSION_LEVELS[attainedRank].unlockCount);
        setViewedRank(previous);
        let revealFrame = 0;
        const baselineFrame = requestAnimationFrame(() => {
          revealFrame = requestAnimationFrame(() => {
            setFromUnlockCount(PROGRESSION_LEVELS[previous].unlockCount);
            setViewedRank(attainedRank);
            setSnapToBaseline(false);
            attainedRankByProfile.set(profileId, attainedRank);
          });
        });
        return () => {
          cancelAnimationFrame(baselineFrame);
          cancelAnimationFrame(revealFrame);
        };
      }
      setFromUnlockCount(PROGRESSION_LEVELS[previous].unlockCount);
      setViewedRank(attainedRank);
      attainedRankByProfile.set(profileId, attainedRank);
    }
    return undefined;
    // Il rango visualizzato non guida il confronto: la baseline appartiene ai dati.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attainedRank, profileId, shared]);

  const viewed = PROGRESSION_LEVELS[viewedRank];
  const viewedUnlockCount = viewed.unlockCount;
  const isViewingAttained = viewedRank === attainedRank;
  const progress = useMemo(() => {
    if (!isViewingAttained) return viewedRank === PROGRESSION_LEVELS.length - 1 ? 100 : 0;
    return Math.round(progression.levelProgress * 100);
  }, [isViewingAttained, progression.levelProgress, viewedRank]);

  function showRank(nextRank: number) {
    if (nextRank === viewedRank) return;
    setFromUnlockCount(viewedUnlockCount);
    setViewedRank(nextRank);
  }

  const nextCopy = isViewingAttained
    ? progression.nextLevel
      ? `${progression.pointsToNextLevel.toLocaleString("it-IT")} punti a ${progression.nextLevel.name}`
      : "Percorso completato"
    : viewedRank > attainedRank
      ? `Anteprima · da ${viewed.threshold.toLocaleString("it-IT")} punti`
      : `Livello raggiunto · da ${viewed.threshold.toLocaleString("it-IT")} punti`;

  return (
    <div
      className={styles.shell}
      data-progression-journey
      data-viewed-rank={viewedRank}
      data-attained-rank={attainedRank}
      data-snap={snapToBaseline}
    >
      <section className={styles.card} aria-labelledby="profile-progression-title">
        <div className={styles.wall} aria-hidden="true">
          <div className={styles.posterField}>
            {POSTERS.map(([file, title], index) => {
              const [desktopRow, desktopColumn] = DESKTOP_SLOTS[index];
              const [mobileRow, mobileColumn] = MOBILE_SLOTS[index];
              const unlocked = index < viewedUnlockCount;
              const newlyUnlocked = unlocked && index >= fromUnlockCount;
              const revealOrder = newlyUnlocked ? index - fromUnlockCount : 0;
              const position = {
                "--desktop-left": `${desktopColumn * 12.5 - (desktopRow % 2) * 3.2}%`,
                "--desktop-top": `${desktopRow * 20}%`,
                "--mobile-left": `${mobileColumn * 20 - (mobileRow % 2) * 5}%`,
                "--mobile-top": `${mobileRow * 12.5}%`,
                "--reveal-order": revealOrder,
              } as CSSProperties;
              return (
                <span
                  className={styles.posterTile}
                  data-poster-index={index}
                  data-unlocked={unlocked}
                  data-newly-unlocked={newlyUnlocked}
                  key={file}
                  style={position}
                  title={title}
                >
                  <span className={styles.tileInner}>
                    <span className={styles.tileBack} />
                    <span className={styles.tileFront}>
                      {/* Le locandine formano un unico fondale decorativo. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/profile-progression/${file}.jpg`} alt="" />
                    </span>
                  </span>
                </span>
              );
            })}
          </div>
        </div>
        <div className={styles.shade} aria-hidden="true" />
        <span className={styles.counter} aria-label={`Livello ${viewedRank + 1} di 8`}>
          {String(viewedRank + 1).padStart(2, "0")}/08
        </span>
        <div className={styles.copy} aria-live="polite">
          {!isViewingAttained && (
            <p className={styles.kicker}>Stai esplorando il percorso</p>
          )}
          <h2 className={styles.title} id="profile-progression-title">
            {viewed.name}
          </h2>
          <p className={styles.points}>
            {isViewingAttained
              ? `${progression.points.toLocaleString("it-IT")} punti`
              : `${viewed.threshold.toLocaleString("it-IT")} punti richiesti`}
            {shared && isViewingAttained && (
              <span className="sr-only">, basato sulle attività condivise</span>
            )}
          </p>
          <div
            className={styles.track}
            role="progressbar"
            aria-label={
              isViewingAttained
                ? "Avanzamento verso il livello successivo"
                : "Anteprima del livello"
            }
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span className={styles.fill} style={{ width: `${progress}%` }} />
          </div>
          <p className={styles.next}>{nextCopy}</p>
          <div className={styles.controls} aria-label="Esplora i livelli del percorso">
            <button
              type="button"
              data-rank-previous
              aria-label="Livello precedente"
              disabled={viewedRank === 0}
              onClick={() => showRank(viewedRank - 1)}
            >
              <span aria-hidden="true">‹</span>
            </button>
            {!isViewingAttained && (
              <button
                type="button"
                data-rank-current
                onClick={() => showRank(attainedRank)}
              >
                {shared ? "Torna al livello" : "Torna al tuo livello"}
              </button>
            )}
            <button
              type="button"
              data-rank-next
              aria-label="Livello successivo"
              disabled={viewedRank === PROGRESSION_LEVELS.length - 1}
              onClick={() => showRank(viewedRank + 1)}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
