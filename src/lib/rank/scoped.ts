import "server-only";

import { recipeFor } from "@/lib/genres/catalog";
import { daPick, filtriDi } from "@/lib/genres/list";
import { genrePicks } from "@/lib/genres/picks";
import { platformIds, type HomeScope } from "@/lib/home/scope";
import { platformCandidates } from "@/lib/platforms/list";
import type { PlatformEntry } from "@/lib/platforms/catalog";
import {
  discoverByGenre,
  discoverForGenre,
  discoverNewOnStreaming,
  PLATFORM_SOGLIE,
} from "@/lib/tmdb/client";
import { candidatiDaTmdb, chiaveCandidato } from "./from-tmdb";
import type { MediaType, RankCandidate } from "./types";

/**
 * I candidati di una home **filtrata** (`src/lib/home/scope.ts`): stesse regole del
 * motore, altra sorgente. Fuori dall'ambito il motore pesca dai generi del profilo,
 * dalle novità delle piattaforme che l'utente usa e dalle classifiche in DB; qui pesca
 * **dentro il filtro** — il `discover` con la ricetta del genere, il catalogo della
 * piattaforma, tutti e due insieme — e restituisce anche di chi è **certo**: un titolo
 * arrivato da `with_watch_providers=8` sta su Netflix anche se `title_providers` non
 * l'ha ancora visto, e uno arrivato dalla ricetta di "Storie vere" è una storia vera
 * anche se nessun dato in cache lo direbbe.
 *
 * Le classifiche e gli amici restano candidati anche qui, ma li verifica
 * `getCandidates` dopo `arricchisci` (piattaforma da `title_providers`, genere dalla
 * ricetta): i certi passano senza verifica, gli altri devono dimostrarlo.
 *
 * Nessun parametro personale nelle `fetch`: cache di Next condivisa, il gusto dopo.
 */

export interface ScopedCandidates {
  candidati: RankCandidate[];
  /** Chiavi `tipo-id` arrivate da un `discover` filtrato sulla piattaforma. */
  certiPiattaforma: Set<string>;
  /** Chiavi arrivate dalla ricetta del genere, o dalla sua lista curata. */
  certiGenere: Set<string>;
}

/** Quante pagine della ricetta del genere: 20 titoli l'una. */
const PAGINE_GENERE = 4;
/** Sotto questo numero di candidati distinti si riprova senza soglie (cataloghi piccoli). */
const TROPPO_POCHI = 20;

function vuoto(): ScopedCandidates {
  return { candidati: [], certiPiattaforma: new Set(), certiGenere: new Set() };
}

/**
 * Le pagine della ricetta di un genere, eventualmente dentro una piattaforma. Con
 * `soloConKeyword` la keyword viaggia su ogni pagina; altrimenti si chiede **anche** una
 * pagina con la keyword, che resta davanti (è la più a tema) — come in
 * `src/lib/genres/list.ts`.
 */
async function pagineDelGenere(
  scope: HomeScope,
  type: MediaType,
  senzaSoglie: boolean,
): Promise<RankCandidate[]> {
  const entry = scope.genre!;
  const filtri = filtriDi(entry, type);
  if (!filtri) return [];
  const soloConKeyword = recipeFor(entry, type)?.soloConKeyword ?? false;
  const providerIds = scope.platforms.length > 0 ? platformIds(scope) : undefined;
  // Dentro una o più piattaforme le soglie del genere (300 voti) svuoterebbero il
  // catalogo: valgono quelle delle piattaforme, e la ricetta può comunque alzarle.
  const soglie = senzaSoglie
    ? { voti: 0, voto: 0 }
    : scope.platforms.length > 0
      ? PLATFORM_SOGLIE[type]
      : undefined;

  const richieste: Promise<RankCandidate[]>[] = [];
  for (let page = 1; page <= PAGINE_GENERE; page++) {
    richieste.push(
      discoverForGenre(type, filtri, {
        page,
        conKeyword: soloConKeyword,
        providerIds,
        soglie,
        senzaSoglie,
      })
        .then((p) => candidatiDaTmdb(p.results, type))
        .catch(() => []),
    );
  }
  if (!soloConKeyword && (filtri.keyword?.length ?? 0) > 0) {
    richieste.unshift(
      discoverForGenre(type, filtri, {
        page: 1,
        conKeyword: true,
        providerIds,
        soglie,
        senzaSoglie,
      })
        .then((p) => candidatiDaTmdb(p.results, type))
        .catch(() => []),
    );
  }
  return (await Promise.all(richieste)).flat();
}

async function perGenere(scope: HomeScope, type: MediaType): Promise<ScopedCandidates> {
  const entry = scope.genre!;
  const out = vuoto();
  if (!filtriDi(entry, type)) return out;

  // La testa curata: certa per il genere, da verificare per la piattaforma.
  for (const p of genrePicks(entry.key)) {
    if (p.mediaType !== type) continue;
    out.candidati.push(daPick(p));
    out.certiGenere.add(chiaveCandidato(p));
  }

  let coda = await pagineDelGenere(scope, type, false);
  if (scope.platforms.length > 0) {
    // Il secondo giro senza soglie salva "Horror su RaiPlay": pochi titoli, pochi voti.
    const distinti = new Set(coda.map(chiaveCandidato)).size;
    if (distinti < TROPPO_POCHI)
      coda = [...coda, ...(await pagineDelGenere(scope, type, true))];
  }
  for (const c of coda) {
    const k = chiaveCandidato(c);
    out.candidati.push(c);
    out.certiGenere.add(k);
    if (scope.platforms.length > 0) out.certiPiattaforma.add(k);
  }
  return out;
}

async function perPiattaforma(
  scope: HomeScope,
  type: MediaType,
  generiDiTesta: readonly number[],
): Promise<ScopedCandidates> {
  // Solo `ids` conta a valle (catalogo TMDB, "novità", generi in testa): l'unione delle
  // piattaforme scelte si finge una piattaforma sola con tutti i loro id.
  const entry: PlatformEntry = { ...scope.platforms[0], ids: platformIds(scope) };
  const out = vuoto();
  const [catalogo, novita, perGenere] = await Promise.all([
    platformCandidates(entry, type).catch(() => []),
    discoverNewOnStreaming(type, entry.ids)
      .then((p) => candidatiDaTmdb(p.results, type))
      .catch(() => []),
    Promise.all(
      generiDiTesta.map((g) =>
        discoverByGenre(type, g, 1, {
          scriptedOnly: true,
          minVotes: PLATFORM_SOGLIE[type].voti,
          minScore: PLATFORM_SOGLIE[type].voto,
          providerIds: entry.ids,
        })
          .then((p) => candidatiDaTmdb(p.results, type))
          .catch(() => []),
      ),
    ),
  ]);
  // I generi del profilo per primi: sono i candidati che l'affinità premierà, e le
  // novità subito dopo; il catalogo per popolarità riempie il resto.
  for (const c of [...perGenere.flat(), ...novita, ...catalogo]) {
    out.candidati.push(c);
    out.certiPiattaforma.add(chiaveCandidato(c));
  }
  return out;
}

/**
 * I candidati dell'ambito. `generiDiTesta` sono i generi del profilo (o di ripiego),
 * già tradotti per il tipo: dentro una piattaforma servono a chiedere "i thriller di
 * Netflix" invece dei soli più popolari.
 */
export async function candidatiDelloScope(
  type: MediaType,
  scope: HomeScope,
  generiDiTesta: readonly number[],
): Promise<ScopedCandidates> {
  if (scope.genre) return perGenere(scope, type);
  if (scope.platforms.length > 0) return perPiattaforma(scope, type, generiDiTesta);
  return vuoto();
}
