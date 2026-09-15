"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PROGRESSION_LEVELS, type ProfileProgression } from "@/lib/profile/progression";
import { auraForRank } from "@/lib/profile/aura";
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
  [2, 3],
  [1, 8],
  [3, 5],
  [1, 2],
  [2, 9],
  [0, 7],
  [3, 0],
  [2, 4],
  [1, 9],
  [3, 8],
  [0, 4],
  [2, 6],
  [1, 1],
  [2, 7],
  [3, 3],
  [0, 0],
  [3, 9],
  [1, 6],
  [2, 0],
  [3, 7],
  [0, 5],
  [2, 2],
  [1, 3],
  [2, 8],
  [3, 1],
  [0, 9],
  [3, 6],
  [1, 0],
  [2, 5],
  [3, 4],
  [0, 3],
  [3, 2],
  [1, 7],
  [2, 1],
  [0, 8],
  [0, 6],
  [1, 5],
  [1, 4],
  [0, 2],
] as const;

/**
 * Schermi larghi: tre file da 13 tessere piu' alte, cosi' la fascia occupa tutta
 * la larghezza senza diventare un muro alto quanto mezza pagina. La tessera in
 * [1, 13] cade oltre il bordo destro: la riga e' gia' coperta dalle dodici prima.
 */
const WIDE_SLOTS = [
  [2, 10],
  [1, 5],
  [2, 11],
  [2, 4],
  [1, 2],
  [0, 4],
  [0, 8],
  [2, 1],
  [2, 6],
  [1, 0],
  [2, 7],
  [1, 11],
  [2, 8],
  [0, 12],
  [0, 3],
  [1, 9],
  [0, 7],
  [0, 10],
  [1, 8],
  [1, 3],
  [1, 13],
  [0, 0],
  [1, 6],
  [1, 1],
  [0, 9],
  [1, 12],
  [0, 1],
  [2, 0],
  [0, 5],
  [2, 5],
  [0, 6],
  [0, 2],
  [2, 3],
  [1, 4],
  [2, 2],
  [2, 12],
  [1, 7],
  [2, 9],
  [0, 11],
  [1, 10],
] as const;

const MOBILE_SLOTS = [
  [0, 1],
  [3, 0],
  [4, 6],
  [2, 5],
  [1, 4],
  [4, 0],
  [1, 7],
  [3, 3],
  [4, 7],
  [0, 4],
  [3, 6],
  [2, 0],
  [4, 4],
  [2, 3],
  [1, 1],
  [3, 5],
  [4, 1],
  [0, 0],
  [3, 7],
  [2, 2],
  [4, 2],
  [2, 7],
  [1, 5],
  [3, 1],
  [4, 5],
  [0, 7],
  [3, 4],
  [2, 6],
  [4, 3],
  [2, 1],
  [1, 0],
  [3, 2],
  [1, 6],
  [0, 3],
  [2, 4],
  [1, 3],
  [0, 6],
  [0, 5],
  [1, 2],
  [0, 2],
] as const;

/**
 * Fondale: la parete prosegue fuori dalla card con le stesse locandine, in colonne
 * che scorrono piano. Riusa i file gia' scaricati dalla card (stessa URL, quindi
 * stessa cache) e le animazioni globali `wall-up`/`wall-down`, che si fermano da
 * sole con `prefers-reduced-motion`. Le immagini sono `loading="lazy"` e il
 * fondale e' `display: none` sotto gli 860px di contenitore: sul telefono, dove
 * la card occupa tutta la larghezza e il fondale non si vedrebbe, non costa un
 * byte (un `<img>` eager dentro un contenitore nascosto verrebbe scaricato lo
 * stesso).
 */
const BLEED_COLUMNS = 18;
/** locandine per colonna: colonne vicine non mostrano mai gli stessi titoli */
const BLEED_PER_COLUMN = 5;
/** tessere per colonna: un set di scorrimento piu' quanto serve a coprire l'altezza */
const BLEED_ITEMS = 12;
const BLEED_OFFSETS = [0, -96, -48, -140, -24, -118] as const;

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

  // L'aura vive dietro l'immagine profilo, in testata, che e' renderizzata dal
  // server: qui si riscrivono le sue due variabili CSS sull'elemento che le porta,
  // cosi' sfogliando i livelli cambia anche la testata. Inline su inline: una
  // dichiarazione sull'elemento vince, ereditare da un antenato no.
  useEffect(() => {
    const testata = document.querySelector<HTMLElement>("[data-profile-aura]");
    if (!testata) return undefined;
    const aura = auraForRank(viewedRank);
    testata.style.setProperty("--aura-rgb", aura.rgb);
    testata.style.setProperty("--aura-alpha", `${aura.alpha}`);
    return () => {
      const raggiunta = auraForRank(attainedRank);
      testata.style.setProperty("--aura-rgb", raggiunta.rgb);
      testata.style.setProperty("--aura-alpha", `${raggiunta.alpha}`);
    };
  }, [attainedRank, viewedRank]);

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
      <div className={styles.bleed} aria-hidden="true">
        <div className={styles.bleedInner}>
          {Array.from({ length: BLEED_COLUMNS }, (_, column) => (
            <div
              key={column}
              className={styles.bleedColumn}
              style={{ marginTop: BLEED_OFFSETS[column % BLEED_OFFSETS.length] }}
            >
              {Array.from({ length: BLEED_ITEMS }, (_, i) => {
                const [file] =
                  POSTERS[
                    (column * BLEED_PER_COLUMN + (i % BLEED_PER_COLUMN)) % POSTERS.length
                  ];
                return (
                  // Stessa URL delle tessere della card: il fondale non scarica nulla di nuovo.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${file}-${i}`}
                    src={`/profile-progression/small/${file}.jpg?v=hd2`}
                    alt=""
                    width={112}
                    height={168}
                    loading="lazy"
                    decoding="async"
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <section className={styles.card} aria-labelledby="profile-progression-title">
        <div className={styles.wall} aria-hidden="true">
          <div className={styles.posterField}>
            {POSTERS.map(([file, title], index) => {
              const [desktopRow, desktopColumn] = DESKTOP_SLOTS[index];
              const [wideRow, wideColumn] = WIDE_SLOTS[index];
              const [mobileRow, mobileColumn] = MOBILE_SLOTS[index];
              const unlocked = index < viewedUnlockCount;
              const newlyUnlocked = unlocked && index >= fromUnlockCount;
              const revealOrder = newlyUnlocked ? index - fromUnlockCount : 0;
              const position = {
                "--desktop-left": `${(desktopColumn + (desktopRow % 2 ? 0.125 : -0.125)) * 10}%`,
                "--desktop-top": `${desktopRow * 25.625}%`,
                "--wide-left": `${(wideColumn + (wideRow % 2 ? 0.15 : -0.15)) * 7.6923}%`,
                "--wide-top": `${wideRow * 33.333}%`,
                "--mobile-left": `${(mobileColumn + (mobileRow % 2 ? 0.125 : -0.125)) * 12.5}%`,
                "--mobile-top": `${mobileRow * 20.625}%`,
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
                      <img
                        src={`/profile-progression/${file}.jpg?v=hd2`}
                        srcSet={`/profile-progression/small/${file}.jpg?v=hd2 342w, /profile-progression/${file}.jpg?v=hd2 ${file === "78" ? 622 : 780}w`}
                        sizes="(min-width: 940px) 9vw, (min-width: 700px) 10vw, 13vw"
                        width={file === "78" ? 622 : 780}
                        height={file === "78" ? 933 : 1170}
                        alt=""
                      />
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
