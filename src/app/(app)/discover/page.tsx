import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { CinemaEntry } from "@/components/cinema/CinemaEntry";
import { DiscoverSections } from "@/components/discover/DiscoverSections";
import { genreByKey, genreByTmdbId } from "@/lib/genres/catalog";

export const metadata = { title: "Scopri" };

interface Props {
  searchParams: Promise<{ type?: string; genre?: string; g?: string }>;
}

export default async function DiscoverPage({ searchParams }: Props) {
  const { type, genre, g } = await searchParams;
  // I vecchi indirizzi di un genere — `?genre=27` (id TMDB) e il `?g=` della prima
  // versione del catalogo — possono ancora arrivare da una cronologia o da un link
  // condiviso: portano alla pagina nuova, che ha il genere nel percorso.
  const entry = genreByKey(g) ?? (genre ? genreByTmdbId(Number(genre)) : null);
  if (entry) {
    const tipo = type === "tv" && entry.tv !== null ? "tv" : "movie";
    redirect(`/discover/${tipo}/${entry.key}`);
  }

  return (
    <>
      <TopBar title="Scopri" back />
      <main className="pb-16">
        <CinemaEntry className="mb-8" />
        <DiscoverSections />
      </main>
    </>
  );
}
