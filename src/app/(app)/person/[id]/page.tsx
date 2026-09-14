import { notFound } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import {
  getPerson,
  getPersonMovieCredits,
  getPersonTvCredits,
  TmdbHttpError,
} from "@/lib/tmdb/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { filmografia, type CreditoPersona } from "@/lib/people/filmography";
import { conoscenzaDi, isFavorite } from "@/lib/people/queries";
import { correggiRuoloPreferito } from "@/lib/people/actions";
import { ruoloDiReparto } from "@/lib/people/types";
import { getRatings, ratingKey } from "@/lib/ratings/queries";
import { PersonHeader } from "@/components/people/PersonHeader";
import {
  PersonFilmography,
  type CreditoConVoti,
} from "@/components/people/PersonFilmography";

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

  // Un 404 vero (la persona non esiste su TMDB) resta `notFound()`; un guasto di
  // TMDB (500, 429, rete) non deve diventare un 404 definitivo — vedi M13 della
  // review finale: `.catch(() => null)` confondeva i due casi.
  let persona;
  try {
    persona = await getPerson(id);
  } catch (err) {
    if (err instanceof TmdbHttpError && err.status === 404) notFound();
    return (
      <>
        <TopBar title="Persona" back />
        <main className="px-5 pt-4 lg:px-10">
          <EmptyState
            title="Scheda non raggiungibile"
            description="Non riusciamo a caricare questa pagina adesso. Riprova fra poco."
          />
        </main>
      </>
    );
  }

  const [movieCredits, tvCredits] = await Promise.all([
    getPersonMovieCredits(id).catch(() => null),
    getPersonTvCredits(id).catch(() => null),
  ]);

  const { interprete, regista } = filmografia(movieCredits, tvCredits);
  const role = ruoloDiReparto(persona.known_for_department);
  const tuttiCrediti = [...interprete, ...regista];

  const [preferito, conoscenza, ratings] = await Promise.all([
    isFavorite(id),
    conoscenzaDi(tuttiCrediti),
    getRatings(tuttiCrediti.map((c) => ({ id: c.id, mediaType: c.mediaType }))),
    // Il ruolo giusto lo sa solo questa pagina (`known_for_department`): se il
    // preferito era stato salvato dalla riga del cast con "Cast" fisso ma questa
    // persona e' un regista, si corregge qui (Important 3 della review finale). Non
    // fa nulla se non e' preferita o se il ruolo e' gia' giusto.
    correggiRuoloPreferito(id, persona.name, persona.profile_path, role),
  ]);

  // ZappScore e voto/stato personale, gia' letti sopra in una query sola per tipo:
  // qui si attaccano al credito giusto, cosi' la griglia non mostra piu' il voto
  // TMDB nudo (Important 2 della review finale).
  function arricchisci(crediti: CreditoPersona[]): CreditoConVoti[] {
    return crediti.map((c) => {
      const chiave = ratingKey(c.id, c.mediaType);
      const voto = ratings.get(chiave);
      const stato = conoscenza.personale.get(chiave);
      return {
        ...c,
        zappScore: voto?.score ?? null,
        zappVotes: voto?.score == null ? 0 : (voto?.votes ?? 0),
        userRating: stato?.rating ?? null,
      };
    });
  }

  const sezioni = [
    { titolo: "Come interprete", crediti: arricchisci(interprete) },
    { titolo: "Come regista", crediti: arricchisci(regista) },
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
          birthday={persona.birthday}
          deathday={persona.deathday}
          role={role}
          favorite={preferito}
          conoscenza={conoscenza}
        />
        {sezioni.length > 0 && <PersonFilmography sezioni={sezioni} />}
      </main>
    </>
  );
}
