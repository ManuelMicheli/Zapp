import { ProgressionJourney } from "./ProgressionJourney";
import { ProgressionDetails } from "./ProgressionDetails";
import { buildProgression, type ProgressionCounts } from "@/lib/profile/progression";

interface Props {
  counts: ProgressionCounts;
  profileId: string;
  isOwn: boolean;
  className?: string;
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
export function ProfileProgression({ counts, profileId, isOwn, className = "" }: Props) {
  const progression = buildProgression(counts);

  return (
    <section
      aria-labelledby="profile-progression-title"
      className={"mx-5 md:mx-0 " + className}
    >
      <ProgressionJourney
        key={(isOwn ? "own" : "shared") + ":" + profileId}
        progression={progression}
        profileId={profileId}
        shared={!isOwn}
      />
      {!isOwn && (
        <p className="mt-2 px-1 text-[11px] text-muted-2">
          Basato sulle attività condivise con te.
        </p>
      )}
      <ProgressionDetails progression={progression} isOwn={isOwn} />
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
      className={
        "mx-5 rounded-[20px] border border-border bg-surface p-4 text-center text-sm text-muted md:mx-0 " +
        className
      }
    >
      Percorso cinefilo non disponibile in questo momento.
    </p>
  );
}
