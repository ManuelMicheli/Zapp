import Image from "next/image";
import { profileUrl } from "@/lib/config";
import { formatScore } from "@/lib/ratings/format";
import { Overview } from "@/components/title/Overview";
import { FavoritePersonButton } from "./FavoritePersonButton";
import type { Conoscenza } from "@/lib/people/queries";
import type { PersonRole } from "@/lib/people/types";

/** Solo l'anno, per non promettere una precisione che una testata non deve dare. */
function anno(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
}

/**
 * Testata della pagina persona: foto, nome, reparto, cuore, e la riga che dice quanto
 * la conosci. La biografia sta qui e non in una pagina sua: come per "Vedi tutto il
 * cast", si espande sul posto.
 *
 * `known_for_department` non dice il genere della persona, quindi il reparto si
 * traduce con parole che valgono per tutti: "Interprete", non "Attore".
 */
export function PersonHeader({
  personId,
  name,
  biography,
  profilePath,
  role,
  birthday,
  deathday,
  favorite,
  conoscenza,
}: {
  personId: number;
  name: string;
  biography: string | null;
  profilePath: string | null;
  role: PersonRole;
  birthday: string | null;
  deathday: string | null;
  favorite: boolean;
  conoscenza: Conoscenza;
}) {
  const media = conoscenza.media != null ? formatScore(conoscenza.media) : null;
  const nascita = anno(birthday);
  const morte = anno(deathday);
  const anni = nascita ? (morte ? `${nascita} – ${morte}` : `${nascita}`) : null;

  return (
    <section className="flex flex-col gap-4 px-5 pb-2 lg:px-10">
      <div className="flex items-center gap-4">
        <div className="relative size-[88px] shrink-0 overflow-hidden rounded-full border border-white/[0.08] bg-surface-2 lg:size-[112px]">
          {profilePath ? (
            <Image
              src={profileUrl(profilePath)!}
              alt={name}
              fill
              priority
              sizes="112px"
              className="object-cover object-[50%_20%]"
            />
          ) : (
            <span className="flex h-full items-center justify-center text-3xl text-muted">
              {name.charAt(0)}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-[28px] font-bold leading-tight tracking-[-0.04em] lg:text-[34px]">
            {name}
          </h2>
          <p className="text-sm text-muted">
            {role === "Regia" ? "Regia" : "Interprete"}
            {anni ? ` · ${anni}` : ""}
          </p>
        </div>

        <FavoritePersonButton
          personId={personId}
          name={name}
          role={role}
          profilePath={profilePath}
          favorite={favorite}
        />
      </div>

      {conoscenza.visti > 0 && (
        <p className="text-[13px] text-muted">
          Hai visto {conoscenza.visti} {conoscenza.visti === 1 ? "titolo" : "titoli"} su{" "}
          {conoscenza.totale}
          {media ? ` · voto medio ${media}` : ""}
        </p>
      )}

      {biography && <Overview text={biography} className="" size={15} heading={false} />}
    </section>
  );
}
