import { TopBar } from "@/components/layout/TopBar";
import { ShortsBrowser } from "@/components/shorts/ShortsBrowser";
import { SHORT_CARDS, SHORT_FILMS, SHORT_GENERI } from "@/lib/shorts/catalog";
import { getStatoCorti } from "@/lib/shorts/queries";

export const metadata = {
  title: "Corti",
  description:
    "Cortometraggi da guardare per intero dentro Zapp: animazione, dramma, horror, fantascienza, in italiano e in inglese.",
};

/**
 * `/corti`: il catalogo dei cortometraggi.
 *
 * L'elenco e' un file (`src/lib/shorts/catalog.ts`), quindi la pagina non fa nessuna
 * chiamata a TMDB e una sola query — lo stato dei corti di chi guarda — che per un
 * ospite non parte nemmeno. I filtri lavorano nel client sulle card gia' in pagina
 * (snelle, senza trama: vedi `SHORT_CARDS`); `ShortsBrowser` spiega il perche'.
 */
export default async function CortiPage() {
  const stato = await getStatoCorti();
  const visti: string[] = [];
  const preferiti: string[] = [];
  for (const [id, s] of stato) {
    if (s.vistoIl) visti.push(id);
    if (s.preferito) preferiti.push(id);
  }

  return (
    <>
      <TopBar title="Corti" back parent={{ label: "Scopri", href: "/discover" }} />
      <main className="px-5 pb-16 lg:px-10">
        <p className="mb-6 max-w-2xl text-pretty text-base leading-relaxed text-muted">
          {SHORT_FILMS.length} cortometraggi da guardare qui, per intero: film da tre
          minuti e da mezz&apos;ora, premiati agli Oscar o nati in una scuola di cinema.
          Si aprono dentro Zapp, non ti portano via.
        </p>
        <ShortsBrowser
          corti={SHORT_CARDS}
          copertina={SHORT_FILMS[0]}
          generi={SHORT_GENERI}
          visti={visti}
          preferiti={preferiti}
        />
      </main>
    </>
  );
}
