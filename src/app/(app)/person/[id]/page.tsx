import { notFound } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { getPerson, getPersonMovieCredits, getPersonTvCredits } from "@/lib/tmdb/client";
import { filmografia } from "@/lib/people/filmography";
import { conoscenzaDi, isFavorite } from "@/lib/people/queries";
import { PersonHeader } from "@/components/people/PersonHeader";
import { PersonFilmography } from "@/components/people/PersonFilmography";

type Props = { params: Promise<{ id: string }> };

function idValido(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 1e12 ? n : null;
}

export async function generateMetadata({ params }: Props) {
  const id = idValido((await params).id);
  if (!id) return { title: "Persona non trovata" };
  const persona = await getPerson(id).catch(() => null);
  return { title: persona?.name ?? "Persona non trovata" };
}

/**
 * La pagina di un attore o di un regista: testata, quanto lo conosci, filmografia.
 *
 * Nessuna cache in Postgres: `getPerson` e le due filmografie hanno gia' un giorno di
 * `revalidate` dentro `tmdbFetch`, e una tabella `persons` sarebbe un secondo posto in
 * cui la stessa biografia invecchia.
 */
export default async function PersonPage({ params }: Props) {
  const id = idValido((await params).id);
  if (!id) notFound();

  const persona = await getPerson(id).catch(() => null);
  if (!persona) notFound();

  const [movieCredits, tvCredits] = await Promise.all([
    getPersonMovieCredits(id).catch(() => null),
    getPersonTvCredits(id).catch(() => null),
  ]);

  const { interprete, regista } = filmografia(movieCredits, tvCredits);
  const role = persona.known_for_department === "Directing" ? "Regia" : "Cast";

  const [preferito, conoscenza] = await Promise.all([
    isFavorite(id),
    conoscenzaDi([...interprete, ...regista]),
  ]);

  const sezioni = [
    { titolo: "Come interprete", crediti: interprete },
    { titolo: "Come regista", crediti: regista },
  ].filter((s) => s.crediti.length > 0);

  return (
    <>
      <TopBar title={persona.name} back />
      <main className="flex flex-col gap-6 pb-16">
        <PersonHeader
          personId={id}
          name={persona.name}
          biography={persona.biography}
          profilePath={persona.profile_path}
          role={role}
          favorite={preferito}
          conoscenza={conoscenza}
        />
        {sezioni.length > 0 && <PersonFilmography sezioni={sezioni} />}
      </main>
    </>
  );
}
