import Link from "next/link";
import {
  buildProgression,
  type ProgressionCategory,
  type ProgressionCounts,
  type ProgressionMilestone,
} from "@/lib/profile/progression";

interface Props {
  counts: ProgressionCounts;
  isOwn: boolean;
  className?: string;
}

const CATEGORY_LABELS: Record<ProgressionCategory, string> = {
  films: "Film",
  series: "Serie",
  ratings: "Voti",
  reviews: "Recensioni",
};

const CATEGORY_UNITS: Record<ProgressionCategory, [string, string]> = {
  films: ["film", "film"],
  series: ["serie", "serie"],
  ratings: ["voto", "voti"],
  reviews: ["recensione", "recensioni"],
};

function MilestoneIcon({ category }: { category: ProgressionCategory }) {
  if (category === "films") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4" />
      </svg>
    );
  }
  if (category === "series") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m9 9 6 3-6 3V9Z" />
      </svg>
    );
  }
  if (category === "ratings") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 2.7 5.6 6.2.8-4.5 4.4 1.1 6.2-5.5-2.9L6.5 20l1.1-6.2-4.5-4.4 6.2-.8L12 3Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h14v11H9l-4 3V5Z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

function FeaturedMilestone({ milestone }: { milestone: ProgressionMilestone }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[16px] border border-accent/20 bg-accent/[0.09] px-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/[0.18] text-accent-pale [&_svg]:size-4 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.8]">
        <MilestoneIcon category={milestone.category} />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          {CATEGORY_LABELS[milestone.category]}
        </span>
        <span className="block truncate text-xs font-semibold">{milestone.label}</span>
      </span>
    </div>
  );
}

function remainingText(milestone: ProgressionMilestone) {
  const [one, many] = CATEGORY_UNITS[milestone.category];
  return `${milestone.remaining} ${milestone.remaining === 1 ? one : many}`;
}

/** Etichetta compatta da mostrare subito sotto il nome del profilo. */
export function ProfileLevelLabel({
  counts,
  shared = false,
}: {
  counts: ProgressionCounts;
  shared?: boolean;
}) {
  const progression = buildProgression(counts);
  return (
    <span className="text-[12px] font-semibold uppercase tracking-[0.13em] text-accent-pale">
      {progression.level.name} · {progression.points.toLocaleString("it-IT")} pt
      {shared && <span className="sr-only">, basato sulle attività condivise</span>}
    </span>
  );
}

/** Sintesi e dettaglio accessibile del percorso cinefilo. */
export function ProfileProgression({ counts, isOwn, className = "" }: Props) {
  const progression = buildProgression(counts);
  const progressPercent = Math.round(progression.levelProgress * 100);

  return (
    <section
      aria-labelledby="profile-progression-title"
      className={`mx-5 rounded-[22px] border border-border bg-surface p-4 md:mx-0 md:p-5 ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-soft">
            Percorso cinefilo
          </p>
          <h2
            id="profile-progression-title"
            className="mt-1 text-[26px] font-extrabold leading-none tracking-[-0.04em]"
          >
            {progression.level.name}
          </h2>
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-2xl font-light tabular-nums text-accent-pale">
            {progression.points.toLocaleString("it-IT")}
          </span>
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted">
            punti
          </span>
        </p>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] text-muted">
          <span>
            {progression.nextLevel ? `Verso ${progression.nextLevel.name}` : "Percorso"}
          </span>
          <span className="tabular-nums">
            {progression.nextLevel ? `${progressPercent}%` : "Livello massimo"}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={
            progression.nextLevel
              ? `Progresso verso ${progression.nextLevel.name}`
              : "Percorso completato"
          }
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progression.nextLevel ? progressPercent : 100}
          className="h-2 overflow-hidden rounded-full bg-white/[0.08]"
        >
          <span
            className="block h-full rounded-full bg-accent-light"
            style={{ width: `${progression.nextLevel ? progressPercent : 100}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          {progression.nextLevel
            ? `${progression.pointsToNextLevel.toLocaleString("it-IT")} punti a ${progression.nextLevel.name}`
            : "Hai raggiunto il livello più alto del percorso."}
        </p>
        {!isOwn && (
          <p className="mt-1 text-[11px] text-muted-2">
            Basato sulle attività condivise con te.
          </p>
        )}
      </div>

      {progression.featuredMilestones.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {progression.featuredMilestones.map((milestone) => (
            <FeaturedMilestone
              key={`${milestone.category}-${milestone.threshold}`}
              milestone={milestone}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-[16px] bg-surface-2 px-3 py-2.5 text-xs text-muted">
          Segna un titolo visto, lascia un voto o scrivi una recensione per il primo
          traguardo.
        </p>
      )}

      <details className="group mt-4 border-t border-border pt-1">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-2 focus-visible:outline-2 focus-visible:outline-accent-light [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-soft">
              Prossimo obiettivo
            </span>
            <span className="mt-0.5 block truncate text-sm font-semibold">
              {progression.nextMilestone
                ? `${progression.nextMilestone.label} · mancano ${remainingText(progression.nextMilestone)}`
                : "Tutti i traguardi raggiunti"}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-accent-soft">
            Dettagli
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="transition-transform group-open:rotate-180"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </summary>

        <div className="flex flex-col gap-5 pb-1 pt-3">
          {isOwn && progression.nextMilestone && (
            <div className="rounded-[18px] bg-surface-2 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-soft">
                Continua il percorso
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={
                    progression.nextMilestone.category === "films" ||
                    progression.nextMilestone.category === "series"
                      ? "/search"
                      : "/library"
                  }
                  className="glass-accent rounded-full px-3 py-2 text-xs font-semibold text-white"
                >
                  {progression.nextMilestone.category === "films" ||
                  progression.nextMilestone.category === "series"
                    ? "Trova cosa guardare"
                    : progression.nextMilestone.category === "ratings"
                      ? "Dai un voto"
                      : "Scrivi una recensione"}
                </Link>
                <Link
                  href="/import"
                  className="glass rounded-full px-3 py-2 text-xs font-semibold text-text"
                >
                  Importa la cronologia
                </Link>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold">Tutti i traguardi</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {progression.milestones.map((milestone) => (
                <div
                  key={`${milestone.category}-${milestone.threshold}`}
                  className={`rounded-[14px] border px-3 py-2.5 ${
                    milestone.achieved
                      ? "border-accent/25 bg-accent/[0.08]"
                      : "border-border bg-surface-2"
                  }`}
                >
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-[0.11em] ${
                      milestone.achieved ? "text-accent-soft" : "text-muted-2"
                    }`}
                  >
                    {CATEGORY_LABELS[milestone.category]}
                  </span>
                  <span className="mt-1 block text-xs font-semibold">
                    {milestone.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted">
                    {milestone.achieved
                      ? "Ottenuto"
                      : `Mancano ${remainingText(milestone)}`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs leading-relaxed text-muted">
            <h3 className="text-sm font-semibold text-text">Come funziona</h3>
            <p className="mt-2">
              5 punti per ogni film o serie distinti segnati come visti, 2 per ogni titolo
              votato e 10 per ogni recensione non oscurata di almeno 80 caratteri, esclusi
              gli spazi iniziali e finali. Import e rimozioni aggiornano i conteggi.
              Modificare un voto o una recensione non aggiunge punti: ogni titolo conta
              una volta per ciascuna categoria.
            </p>
            <p className="mt-2">
              Limiti: 2.500 punti dalle visioni, 2.000 dai voti e 5.000 dalle recensioni.
              Il livello racconta la tua partecipazione su Zapp.
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}

export function ProfileProgressionUnavailable({
  className = "",
}: {
  className?: string;
}) {
  return (
    <p
      className={`mx-5 rounded-[20px] border border-border bg-surface p-4 text-center text-sm text-muted md:mx-0 ${className}`}
    >
      Percorso cinefilo non disponibile in questo momento.
    </p>
  );
}
