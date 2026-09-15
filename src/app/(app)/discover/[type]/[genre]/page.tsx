import Link from "next/link";
import { notFound } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import {
  POSTER_GRID_DESKTOP,
  POSTER_GRID_SIZES,
  PosterCard,
} from "@/components/ui/PosterCard";
import { genreByKey } from "@/lib/genres/catalog";
import { getGenreList } from "@/lib/genres/list";
import { platformByKey } from "@/lib/platforms/catalog";
import { getPlatformList } from "@/lib/platforms/list";
import { withScores } from "@/lib/ratings/cards";

/**
 * La pagina di una voce del catalogo: un **genere** (`/discover/movie/classici`) o una
 * **piattaforma** (`/discover/movie/netflix`). Due cataloghi, una pagina: cambia solo da
 * dove arriva la lista, e le chiavi dei due cataloghi non si sovrappongono (c'è un test
 * che lo controlla).
 *
 * Tipo e chiave stanno nel **percorso**, non nella query. Non è estetica: con
 * `?type=…&g=…` sullo stesso `/discover`, cambiare pillola non navigava affatto — il
 * router dell'App Router considerava di essere già lì e l'URL non si muoveva (verificato
 * con Playwright il 2026-09-08, e valeva anche per le vecchie pillole `?genre=`).
 *
 * E la piattaforma sta **qui** e non in una rotta sua (`/discover/platform/[type]/[…]`,
 * provata e buttata il 2026-09-15): da quella, il click su "Serie" non navigava. La
 * richiesta RSC del nuovo percorso partiva e tornava 200 con l'albero giusto, ma l'URL
 * non si muoveva e la pagina restava quella dei film — cioè la stessa trappola delle
 * pillole in query, con un'altra faccia. Su questa rotta la stessa navigazione funziona
 * da mesi, e due percorsi diversi restano due navigazioni vere.
 */

interface Props {
  params: Promise<{ type: string; genre: string }>;
}

/** Ciò che la pagina deve sapere, qualunque sia il catalogo di partenza. */
interface Voce {
  key: string;
  titolo: string;
  sottotitolo: string;
  /** `false` per le voci che non hanno senso come serie: niente pillole Film/Serie. */
  ancheSerie: boolean;
  lista: (type: "movie" | "tv") => Promise<Awaited<ReturnType<typeof getGenreList>>>;
}

/** Genere o piattaforma: la chiave decide, e i due cataloghi non si pestano i piedi. */
function voceDi(key: string): Voce | null {
  const genere = genreByKey(key);
  if (genere) {
    return {
      key: genere.key,
      titolo: genere.titolo,
      sottotitolo: genere.sottotitolo,
      ancheSerie: genere.tv !== null,
      lista: (type) => getGenreList(genere, type),
    };
  }
  const piattaforma = platformByKey(key);
  if (piattaforma) {
    return {
      key: piattaforma.key,
      titolo: piattaforma.titolo,
      sottotitolo: piattaforma.sottotitolo,
      // Ogni piattaforma ha film e serie
      ancheSerie: true,
      lista: (type) => getPlatformList(piattaforma, type),
    };
  }
  return null;
}

/** Le due pillole Film / Serie. Una voce solo film non offre una scelta che non c'è. */
function TypeSwitch({ voce, mediaType }: { voce: Voce; mediaType: "movie" | "tv" }) {
  if (!voce.ancheSerie) return null;
  const pill = (attiva: boolean) =>
    `rounded-full px-4 py-1.5 text-xs font-semibold ${
      attiva ? "glass-accent text-white" : "border border-border bg-surface text-muted"
    }`;
  return (
    <div className="mb-4 flex gap-2">
      <Link href={`/discover/movie/${voce.key}`} className={pill(mediaType === "movie")}>
        Film
      </Link>
      <Link href={`/discover/tv/${voce.key}`} className={pill(mediaType === "tv")}>
        Serie
      </Link>
    </div>
  );
}

export async function generateMetadata({ params }: Props) {
  const { genre } = await params;
  const voce = voceDi(genre);
  return { title: voce ? voce.titolo : "Scopri" };
}

export default async function GenrePage({ params }: Props) {
  const { type, genre } = await params;
  const voce = voceDi(genre);
  // La chiave arriva dall'URL, cioè da chiunque: sconosciuta → 404, mai una query
  // costruita su una stringa che non abbiamo scritto noi.
  if (!voce) notFound();
  if (type !== "movie" && type !== "tv") notFound();
  // Una voce solo film sotto `/tv` non esiste: meglio un 404 di una pagina vuota.
  if (type === "tv" && !voce.ancheSerie) notFound();

  // Lo ZappScore della griglia in una lettura sola, come negli scaffali della home.
  const items = await withScores(await voce.lista(type));

  return (
    <>
      <TopBar title={voce.titolo} back parent={{ label: "Scopri", href: "/discover" }} />
      <main className="px-5 pb-16 lg:px-10">
        <p className="mb-4 max-w-[52ch] text-[14px] text-muted">{voce.sottotitolo}</p>
        <TypeSwitch voce={voce} mediaType={type} />
        <div className={`grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 ${POSTER_GRID_DESKTOP}`}>
          {items.map((item, i) => (
            <PosterCard
              key={`${item.mediaType}-${item.id}`}
              title={item.title}
              posterPath={item.posterPath}
              year={item.year}
              rating={item.zappScore ?? item.rating ?? undefined}
              votes={item.zappVotes}
              affinity={item.affinity}
              sizes={POSTER_GRID_SIZES}
              href={`/title/${item.mediaType}/${item.id}`}
              signal={{ surface: "discover", position: i }}
            />
          ))}
        </div>
        {items.length === 0 && (
          <p className="mt-12 text-center text-sm text-muted">
            {type === "tv" ? "Nessuna serie da mostrare." : "Nessun film da mostrare."}
          </p>
        )}
      </main>
    </>
  );
}
