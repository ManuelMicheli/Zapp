import Link from "next/link";
import { notFound } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { PosterCard } from "@/components/ui/PosterCard";
import { genreByKey, type GenreEntry } from "@/lib/genres/catalog";
import { getGenreList } from "@/lib/genres/list";
import { withScores } from "@/lib/ratings/cards";

/**
 * La pagina di una voce del catalogo dei generi.
 *
 * Tipo e chiave stanno nel **percorso** (`/discover/movie/classici`), non nella query.
 * Non è estetica: con `?type=…&g=…` sullo stesso `/discover`, cambiare pillola non
 * navigava affatto — il router dell'App Router considerava di essere già lì e l'URL non
 * si muoveva (verificato con Playwright il 2026-09-08, e valeva anche per le vecchie
 * pillole `?genre=`). Due percorsi diversi, due navigazioni vere.
 */

/** `sizes` della griglia: senza, il loader TMDB si ferma a `w342` e su desktop sgrana. */
const GRID_SIZES =
  "(max-width: 640px) 33vw, (max-width: 768px) 25vw, (max-width: 1024px) 20vw, (max-width: 1280px) 16vw, 12vw";

interface Props {
  params: Promise<{ type: string; genre: string }>;
}

/** Le due pillole Film / Serie. Una voce solo film non offre una scelta che non c'è. */
function TypeSwitch({
  entry,
  mediaType,
}: {
  entry: GenreEntry;
  mediaType: "movie" | "tv";
}) {
  if (entry.tv === null) return null;
  const pill = (attiva: boolean) =>
    `rounded-full px-4 py-1.5 text-xs font-semibold ${
      attiva ? "glass-accent text-white" : "border border-border bg-surface text-muted"
    }`;
  return (
    <div className="mb-4 flex gap-2">
      <Link href={`/discover/movie/${entry.key}`} className={pill(mediaType === "movie")}>
        Film
      </Link>
      <Link href={`/discover/tv/${entry.key}`} className={pill(mediaType === "tv")}>
        Serie
      </Link>
    </div>
  );
}

export async function generateMetadata({ params }: Props) {
  const { genre } = await params;
  const entry = genreByKey(genre);
  return { title: entry ? entry.titolo : "Scopri" };
}

export default async function GenrePage({ params }: Props) {
  const { type, genre } = await params;
  const entry = genreByKey(genre);
  // La chiave arriva dall'URL, cioè da chiunque: sconosciuta → 404, mai una query
  // costruita su una stringa che non abbiamo scritto noi.
  if (!entry) notFound();
  if (type !== "movie" && type !== "tv") notFound();
  // Una voce solo film sotto `/tv` non esiste: meglio un 404 di una pagina vuota.
  if (type === "tv" && entry.tv === null) notFound();

  // Lo ZappScore della griglia in una lettura sola, come negli scaffali della home.
  const items = await withScores(await getGenreList(entry, type));

  return (
    <>
      <TopBar title={entry.titolo} back parent={{ label: "Scopri", href: "/discover" }} />
      <main className="px-5 pb-16 lg:px-10">
        <p className="mb-4 max-w-[52ch] text-[14px] text-muted">{entry.sottotitolo}</p>
        <TypeSwitch entry={entry} mediaType={type} />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {items.map((item, i) => (
            <PosterCard
              key={`${item.mediaType}-${item.id}`}
              title={item.title}
              posterPath={item.posterPath}
              year={item.year}
              rating={item.zappScore ?? item.rating ?? undefined}
              votes={item.zappVotes}
              affinity={item.affinity}
              sizes={GRID_SIZES}
              href={`/title/${item.mediaType}/${item.id}`}
              signal={{ surface: "discover", position: i }}
            />
          ))}
        </div>
        {items.length === 0 && (
          <p className="mt-12 text-center text-sm text-muted">
            {type === "tv"
              ? "Nessuna serie per questo genere."
              : "Nessun film per questo genere."}
          </p>
        )}
      </main>
    </>
  );
}
