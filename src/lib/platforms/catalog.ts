import { PROVIDERS } from "@/lib/config";
import { mappaDi, type TasteVector } from "@/lib/rank/vector";

/**
 * Le pillole "Per piattaforma" della home: un catalogo curato, come quello dei generi.
 *
 * Non è l'elenco di `watch/providers` (in Italia sono oltre cento, fra noleggi e canali
 * Amazon): sono le dieci piattaforme su abbonamento che la gente ha davvero, le stesse
 * dell'accesso rapido della home (`MAIN_PROVIDER_IDS`), nello stesso ordine.
 *
 * Ogni voce porta **tutti** gli id con cui TMDB pubblica quel servizio, non solo il
 * principale: Prime Video esiste anche come "with Ads" (2100) e mezza Italia lo vede
 * così, Paramount+ e HBO Max si vendono anche come canale Amazon o Apple. Chiedere il
 * solo id principale lasciava fuori titoli che sull'app di quella piattaforma ci sono.
 * Gli id sono verificati contro `watch/providers?watch_region=IT` (2026-09-15).
 */
export interface PlatformEntry {
  /** Va nel percorso: `/discover/platform/movie/netflix`. */
  key: string;
  /** Il testo della pillola (corto: sta in una fila). */
  pillola: string;
  /** Il titolo della pagina. */
  titolo: string;
  /** La riga sotto il titolo. */
  sottotitolo: string;
  /** L'id principale: logo, marchio, colore. */
  providerId: number;
  /** Tutti gli id del servizio (principale, versione con pubblicità, canali). */
  ids: number[];
}

/** Il nome del servizio sta in un posto solo: `PROVIDERS` in `src/lib/config.ts`. */
function nome(id: number): string {
  return PROVIDERS[id]?.name ?? String(id);
}

function voce(
  key: string,
  providerId: number,
  ids: number[],
  pillola = nome(providerId),
): PlatformEntry {
  return {
    key,
    pillola,
    titolo: `Su ${nome(providerId)}`,
    sottotitolo: `Film e serie in abbonamento su ${nome(providerId)}, dai più amati ai più vicini al tuo gusto.`,
    providerId,
    ids,
  };
}

export const PLATFORMS: PlatformEntry[] = [
  voce("netflix", 8, [8]),
  // 2100 = Prime Video with Ads: stesso catalogo, id diverso
  voce("prime-video", 119, [119, 2100]),
  voce("disney-plus", 337, [337]),
  // 2243 = Apple TV come canale Amazon. 2 (Apple TV Store) è noleggio: fuori.
  voce("apple-tv", 350, [350, 2243]),
  voce("now", 39, [39]),
  // 582 = canale Amazon, 1853 = canale Apple TV
  voce("paramount-plus", 531, [531, 582, 1853]),
  voce("raiplay", 222, [222]),
  voce("discovery-plus", 524, [524, 584]),
  // 1825 = HBO Max come canale Amazon
  voce("hbo-max", 1899, [1899, 1825]),
  // 110 "Infinity+" e 1726 "Infinity Selection" sono lo stesso servizio Mediaset
  voce("mediaset-infinity", 359, [359, 110, 1726], "Infinity"),
];

export function platformByKey(key: string): PlatformEntry | undefined {
  return PLATFORMS.find((p) => p.key === key);
}

/**
 * Quanto questo servizio somiglia a ciò che l'utente guarda: il massimo fra i suoi id
 * sulla dimensione `provider` del profilo (fase A). Un id che il profilo non conosce
 * vale 0, non negativo: "non lo so" non è "non gli piace".
 */
export function platformAffinity(v: TasteVector, entry: PlatformEntry): number {
  let max = 0;
  for (const id of entry.ids) {
    const valore = mappaDi(v, "provider").get(String(id));
    if (valore != null && valore > max) max = valore;
  }
  return max;
}

/** Quante voci il gusto può portare in testa: come per i generi, le prime quattro. */
const TESTA_PERSONALE = 4;

/**
 * Le pillole nell'ordine giusto per questo utente: davanti le piattaforme su cui guarda
 * davvero, dietro le altre **nell'ordine del catalogo**. Profilo povero o assente →
 * l'ordine del catalogo, identico per tutti. Stabile: a parità di affinità decide la
 * posizione in `PLATFORMS`, così la fila non balla fra due render.
 */
export function orderPlatforms(
  v: TasteVector | null,
  quante = TESTA_PERSONALE,
): PlatformEntry[] {
  if (!v || !v.abbastanza) return PLATFORMS;
  const posizione = new Map(PLATFORMS.map((e, i) => [e.key, i]));
  const forti = PLATFORMS.map((e) => ({ e, a: platformAffinity(v, e) }))
    .filter((x) => x.a > 0)
    .sort((a, b) => b.a - a.a || posizione.get(a.e.key)! - posizione.get(b.e.key)!)
    .slice(0, quante)
    .map((x) => x.e);
  const scelte = new Set(forti.map((e) => e.key));
  return [...forti, ...PLATFORMS.filter((e) => !scelte.has(e.key))];
}
