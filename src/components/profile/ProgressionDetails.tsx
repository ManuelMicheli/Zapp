"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  ProfileProgression as Progression,
  ProgressionCategory,
  ProgressionMilestone,
} from "@/lib/profile/progression";
import styles from "./ProgressionDetails.module.css";

interface Props {
  progression: Progression;
  isOwn: boolean;
}

const CATEGORY_LABELS: Record<ProgressionCategory, string> = {
  ratings: "Voti",
  films: "Film",
  series: "Serie",
  reviews: "Recensioni",
};

const CATEGORY_UNITS: Record<ProgressionCategory, [string, string]> = {
  ratings: ["voto", "voti"],
  films: ["film", "film"],
  series: ["serie", "serie"],
  reviews: ["recensione", "recensioni"],
};

const CATEGORY_ORDER: ProgressionCategory[] = ["ratings", "films", "series", "reviews"];

function countLabel(category: ProgressionCategory, count: number) {
  const [one, many] = CATEGORY_UNITS[category];
  return count + " " + (count === 1 ? one : many);
}

function remainingLabel(milestone: ProgressionMilestone) {
  const [one, many] = CATEGORY_UNITS[milestone.category];
  return milestone.remaining + " " + (milestone.remaining === 1 ? one : many);
}

function goalTitle(milestone: ProgressionMilestone, isOwn: boolean) {
  const remainder = remainingLabel(milestone);
  if (isOwn) {
    return milestone.remaining === 1
      ? "Ti manca " + remainder + "."
      : "Ti mancano " + remainder + ".";
  }
  return milestone.remaining === 1
    ? "Manca " + remainder + "."
    : "Mancano " + remainder + ".";
}

function goalAction(category: ProgressionCategory) {
  switch (category) {
    case "films":
    case "series":
      return { href: "/search", label: "Cerca un titolo" };
    case "ratings":
      return { href: "/library", label: "Dai un voto" };
    case "reviews":
      return { href: "/library", label: "Scrivi una recensione" };
  }
}

export function ProgressionDetails({ progression, isOwn }: Props) {
  const [selectedCategory, setSelectedCategory] =
    useState<ProgressionCategory>("ratings");
  const { counts, milestones, nextMilestone } = progression;
  const achievedTotal = milestones.filter((milestone) => milestone.achieved).length;
  const selectedMilestones = milestones.filter(
    (milestone) => milestone.category === selectedCategory,
  );
  const selectedNext = selectedMilestones.find((milestone) => !milestone.achieved);
  const goalProgress = nextMilestone
    ? Math.max(
        0,
        Math.min(100, (counts[nextMilestone.category] / nextMilestone.threshold) * 100),
      )
    : 100;
  const action = nextMilestone ? goalAction(nextMilestone.category) : null;

  return (
    <div className={styles.details}>
      <div className={styles.activity} aria-label="Attività">
        {(["ratings", "films", "series"] as const).map((category) => (
          <button
            key={category}
            type="button"
            aria-pressed={selectedCategory === category}
            onClick={() => setSelectedCategory(category)}
            className={styles.activityButton}
          >
            {countLabel(category, counts[category])}
          </button>
        ))}
      </div>

      <section className={styles.goal} aria-labelledby="profile-goal-title">
        {nextMilestone ? (
          <>
            <h2 id="profile-goal-title">{goalTitle(nextMilestone, isOwn)}</h2>
            <p className={styles.muted}>
              {isOwn ? "Il prossimo traguardo" : "Prossimo traguardo"}:{" "}
              {nextMilestone.label}
            </p>
            <div
              className={styles.goalTrack}
              role="progressbar"
              aria-label={"Avanzamento verso " + nextMilestone.label}
              aria-valuenow={counts[nextMilestone.category]}
              aria-valuemin={0}
              aria-valuemax={nextMilestone.threshold}
            >
              <span style={{ width: goalProgress + "%" }} />
            </div>
            <div className={styles.goalRange}>
              <span>
                {countLabel(nextMilestone.category, counts[nextMilestone.category])}
              </span>
              <span>{countLabel(nextMilestone.category, nextMilestone.threshold)}</span>
            </div>
            {isOwn && action && (
              <Link href={action.href} className={styles.action}>
                {action.label}
              </Link>
            )}
          </>
        ) : (
          <>
            <h2 id="profile-goal-title">Tutti i traguardi raggiunti</h2>
            <p className={styles.muted}>
              {isOwn
                ? "Hai completato i traguardi della tua attività."
                : "Tutti i traguardi dell’attività condivisa sono stati completati."}
            </p>
          </>
        )}
        {isOwn && (
          <Link href="/import" className={styles.importAction}>
            Importa la cronologia
          </Link>
        )}
      </section>

      <section className={styles.milestones} aria-labelledby="profile-milestones-title">
        <div className={styles.sectionHead}>
          <h3 id="profile-milestones-title">Traguardi</h3>
          <span className={styles.muted}>
            {achievedTotal} di {milestones.length} ottenuti
          </span>
        </div>
        <div className={styles.filters} aria-label="Filtra i traguardi">
          {CATEGORY_ORDER.map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={selectedCategory === category}
              onClick={() => setSelectedCategory(category)}
              className={styles.filterButton}
            >
              {CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>
        <div className={styles.milestoneList} aria-live="polite">
          {selectedMilestones.map((milestone) => {
            const isNext = milestone === selectedNext;
            const current = counts[selectedCategory];
            const progress = Math.max(
              0,
              Math.min(100, (current / milestone.threshold) * 100),
            );
            return (
              <div
                key={milestone.category + ":" + milestone.threshold}
                className={styles.milestoneRow}
              >
                <span className={styles.milestoneMark} aria-hidden="true">
                  {milestone.achieved ? "✓" : ""}
                </span>
                <span className={styles.milestoneName}>
                  {milestone.achieved && <span className="sr-only">Raggiunto: </span>}
                  <span className={!milestone.achieved && !isNext ? styles.future : ""}>
                    {milestone.label}
                  </span>
                  {isNext && (
                    <small>
                      {milestone.remaining === 1 ? "Manca" : "Mancano"}{" "}
                      {remainingLabel(milestone)}
                    </small>
                  )}
                </span>
                {isNext && (
                  <span className={styles.milestoneProgress} aria-hidden="true">
                    <span style={{ width: progress + "%" }} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <details className={styles.guide} aria-labelledby="profile-guide-title">
        <summary className={styles.guideSummary}>
          <h3 id="profile-guide-title">Come funziona</h3>
          <span className={styles.guideChevron} aria-hidden="true" />
        </summary>
        <div className={styles.guideGrid}>
          <div>
            <strong>
              +5 punti <span>Film e serie</span>
            </strong>
            <p>Per ogni titolo distinto segnato come visto.</p>
            <p className={styles.limit}>Limite: 2.500 punti</p>
          </div>
          <div>
            <strong>
              +2 punti <span>Voti</span>
            </strong>
            <p>Per ogni titolo distinto votato.</p>
            <p className={styles.limit}>Limite: 2.000 punti</p>
          </div>
          <div>
            <strong>
              +10 punti <span>Recensioni</span>
            </strong>
            <p>
              Per ogni recensione non oscurata di almeno 80 caratteri, esclusi gli spazi
              iniziali e finali.
            </p>
            <p className={styles.limit}>Limite: 5.000 punti</p>
          </div>
        </div>
        <p className={styles.guideNote}>
          Ogni titolo conta una volta per categoria. Le modifiche non aggiungono punti;
          importazioni e rimozioni aggiornano il totale. I traguardi sono separati dai
          livelli.
        </p>
      </details>
    </div>
  );
}
