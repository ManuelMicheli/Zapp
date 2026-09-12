import "server-only";

import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { searchMovies, searchTv } from "@/lib/tmdb/client";
import { createServiceClient } from "@/lib/supabase/server";
import { samePrimeName } from "./prime-resolve";
import type { ParsedMedia } from "../types";

/**
 * Fra piu' titoli che si chiamano **uguale**, sceglie quello che la piattaforma
 * che si sta guardando offre davvero.
 *
 * Serve solo alla TV, e solo quando la strada normale ha gia' rinunciato. Li'
 * il tipo (film o serie) e' una deduzione e non un dato, e gli omonimi sono la
 * regola piu' che l'eccezione: *Doctor Who* su TMDB e' tre serie (1963, 2005,
 * 2024) e almeno un film, e una sola di quelle sta su Disney+ Italia — la 2024.
 * Il nome non le distingue, la durata nemmeno (sono tutti episodi da tre
 * quarti d'ora): **le distingue la piattaforma**, che e' l'unica cosa che
 * sappiamo con certezza, perche' e' l'app da cui arriva l'evento.
 *
 * Costa qualche chiamata a TMDB, quindi si paga **una volta per sessione**:
 * appena il titolo giusto entra in cache con i suoi provider, il battito
 * successivo lo ritrova dalla strada normale, dove la presenza sulla
 * piattaforma e' gia' uno dei punteggi.
 */
export async function scegliFraOmonimi(
  parsed: ParsedMedia,
  providerId: number,
): Promise<{ titleId: number; mediaType: "movie" | "tv" } | null> {
  if (!parsed.title) return null;

  // Un battito ogni 30 secondi rifarebbe questo giro per tutta la durata di un
  // episodio: la strada normale continua a preferire l'omonimo sbagliato anche
  // dopo, perche' prova prima il tipo dedotto. La risposta pero' non cambia, e
  // tenerla qui costa una riga di memoria per titolo.
  const chiave = `${providerId}:${parsed.title.toLowerCase()}`;
  const ricordo = memoria.get(chiave);
  if (ricordo && Date.now() - ricordo.quando < RICORDO_MS) return ricordo.esito;

  const [serie, film] = await Promise.all([
    searchTv(parsed.title).catch(() => null),
    searchMovies(parsed.title).catch(() => null),
  ]);

  // Solo gli omonimi veri: un titolo che *contiene* il nome letto (Doctor Who
  // Confidential) non e' cio' che si sta guardando.
  const candidati: { id: number; mediaType: "movie" | "tv" }[] = [
    ...(serie?.results ?? [])
      .filter((r) => samePrimeName(parsed.title, r.name) || samePrimeName(parsed.title, r.original_name ?? ""))
      .map((r) => ({ id: r.id, mediaType: "tv" as const })),
    ...(film?.results ?? [])
      .filter((r) => samePrimeName(parsed.title, r.title) || samePrimeName(parsed.title, r.original_title ?? ""))
      .map((r) => ({ id: r.id, mediaType: "movie" as const })),
  ].slice(0, MAX_CANDIDATI);

  if (candidati.length === 0) return null;

  // `getOrFetchTitle` riempie anche `title_providers`: e' il motivo per cui si
  // chiama qui invece di leggere la cache, che per un titolo mai visto e' vuota
  // — ed era vuota, infatti, per tutti i Doctor Who.
  await Promise.all(
    candidati.map((c) =>
      getOrFetchTitle(c.id, c.mediaType, { requireFull: true }).catch(() => null),
    ),
  );

  const service = createServiceClient();
  const offerti: typeof candidati = [];
  for (const c of candidati) {
    const { data } = await service
      .from("title_providers")
      .select("title_id")
      .eq("title_id", c.id)
      .eq("media_type", c.mediaType)
      .eq("provider_id", providerId)
      .limit(1)
      .maybeSingle();
    if (data) offerti.push(c);
  }

  // Zero: nessuno degli omonimi e' su quella piattaforma, quindi il titolo
  // letto non e' nessuno di questi. Piu' d'uno: la piattaforma li offre
  // entrambi e non abbiamo altro con cui separarli — meglio fermarsi.
  const esito =
    offerti.length === 1
      ? { titleId: offerti[0].id, mediaType: offerti[0].mediaType }
      : null;
  ricorda(chiave, esito);
  return esito;
}

/**
 * La risposta gia' data per questo titolo su questa piattaforma, se c'e'.
 *
 * Si consulta **prima** della strada normale: senza, ogni battito ripaga due
 * ricerche TMDB per poi essere rifiutato dalla verifica del nome e finire di
 * nuovo qui. La decisione, una volta presa, non cambia.
 */
export function ricordoOmonimo(
  titolo: string,
  providerId: number,
): { titleId: number; mediaType: "movie" | "tv" } | null | undefined {
  const ricordo = memoria.get(`${providerId}:${titolo.toLowerCase()}`);
  if (!ricordo || Date.now() - ricordo.quando >= RICORDO_MS) return undefined;
  return ricordo.esito;
}

/**
 * Memoria di processo, non una cache condivisa: se l'istanza cambia si rifa'
 * il giro, e va benissimo. Anche il "no" si ricorda — e' la risposta che si
 * ripeterebbe piu' spesso.
 */
const memoria = new Map<
  string,
  { quando: number; esito: { titleId: number; mediaType: "movie" | "tv" } | null }
>();
const RICORDO_MS = 6 * 60 * 60 * 1000;
const MAX_RICORDI = 500;

function ricorda(
  chiave: string,
  esito: { titleId: number; mediaType: "movie" | "tv" } | null,
) {
  if (memoria.size >= MAX_RICORDI) {
    // Senza un tetto la mappa cresce per sempre su un'istanza longeva.
    const piuVecchia = memoria.keys().next().value;
    if (piuVecchia !== undefined) memoria.delete(piuVecchia);
  }
  memoria.set(chiave, { quando: Date.now(), esito });
}

/** Oltre questi non si guarda: sono gia' tutti gli omonimi plausibili. */
const MAX_CANDIDATI = 6;
