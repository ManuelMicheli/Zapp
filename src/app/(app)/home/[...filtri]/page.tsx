import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Home } from "@/components/home/HomePage";
import {
  parseScope,
  scopeCanonico,
  scopePath,
  scopeTitle,
  type HomeScope,
} from "@/lib/home/scope";

/**
 * La home filtrata: `/home/thriller`, `/home/netflix`, `/home/thriller/netflix`.
 *
 * È la stessa pagina di `/` con l'ambito letto dal percorso (`src/lib/home/scope.ts`):
 * le pillole "Per genere" e "Per piattaforma" portano qui invece che a Scopri. L'ambito
 * sta nel **percorso** e non nella query perché sullo stesso pathname con la sola query
 * diversa l'App Router non naviga (vedi `docs/architecture/genres.md`); e sta in un solo
 * segmento catch-all perché genere e piattaforma si intrecciano e l'ordine non deve
 * contare: `/home/netflix/thriller` rimanda alla forma canonica, genere prima.
 */
type Params = { params: Promise<{ filtri: string[] }> };

async function scopeDi({
  params,
}: Params): Promise<{ scope: HomeScope; filtri: string[] }> {
  const { filtri } = await params;
  const scope = parseScope(filtri);
  if (!scope) notFound();
  return { scope, filtri };
}

export async function generateMetadata(props: Params): Promise<Metadata> {
  const { scope } = await scopeDi(props);
  return { title: scopeTitle(scope) ?? "Home" };
}

export default async function HomeFiltrata(props: Params) {
  const { scope, filtri } = await scopeDi(props);
  if (!scopeCanonico(filtri, scope)) redirect(scopePath(scope));
  return <Home scope={scope} />;
}
