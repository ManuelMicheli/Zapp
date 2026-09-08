import type { NomiPerMotivo } from "./explain";
import type { Dimensione, RankCandidate } from "./types";
import type { TasteVector } from "./vector";

/**
 * Gli scaffali che nascono dal profilo (fase D).
 *
 * Puro e testato: quali file compaiono in home e come si chiamano è una scelta di
 * prodotto, e va letta in un file, non dedotta da tre query.
 *
 * L'ordine di preferenza — persone, generi, decenni — non è casuale: "Ancora con Pedro
 * Pascal" dice all'utente qualcosa che non sapeva di aver detto, "Perché ami il dramma"
 * è quasi ovvio, "Il meglio degli anni 2000" è il meno specifico dei tre.
 */

/** Sotto questa quota (frazione del massimo) il legame è troppo debole per un titolo. */
export const SOGLIA_RAIL = 0.55;
/** Oltre tre, la home diventa un elenco di sé stessa. */
export const MAX_RAILS = 3;
/** Sotto questi titoli una fila sembra un errore, non una selezione. */
export const MIN_RAIL = 6;

/** Le dimensioni che meritano uno scaffale, in ordine di quanto sono specifiche. */
const DIMENSIONI_RAIL: Dimensione[] = ["persone", "generi", "decenni"];

export interface RailSpec {
  /** Chiave stabile: `persone|Regia:Nolan`. */
  key: string;
  dimensione: Dimensione;
  /** La chiave dentro quella dimensione: `28`, `Cast:Pedro Pascal`, `2000`. */
  chiave: string;
  titolo: string;
  /** Quanto forte è il legame, per ordinare i rail fra loro. */
  peso: number;
}

function titoloDi(
  dimensione: Dimensione,
  chiave: string,
  nomi: NomiPerMotivo,
): string | null {
  switch (dimensione) {
    case "persone": {
      const [ruolo, ...resto] = chiave.split(":");
      const nome = resto.join(":");
      if (!nome) return null;
      return ruolo === "Regia" ? `Ancora di ${nome}` : `Ancora con ${nome}`;
    }
    case "generi": {
      const nome = nomi.generi.get(chiave);
      return nome ? `Perché ami ${nome.toLowerCase()}` : null;
    }
    case "decenni":
      return `Il meglio degli anni ${chiave}`;
    default:
      return null;
  }
}

/** La chiave più forte di una dimensione, se supera la soglia. */
function testaDi(mappa: Map<string, number>): { chiave: string; peso: number } | null {
  let migliore: { chiave: string; peso: number } | null = null;
  for (const [chiave, peso] of mappa) {
    if (peso < SOGLIA_RAIL) continue;
    if (!migliore || peso > migliore.peso) migliore = { chiave, peso };
  }
  return migliore;
}

export function buildRails(v: TasteVector, nomi: NomiPerMotivo): RailSpec[] {
  const out: RailSpec[] = [];
  for (const dimensione of DIMENSIONI_RAIL) {
    if (out.length >= MAX_RAILS) break;
    // Una dimensione dà **un** rail e non due: "Perché ami il dramma" e "Perché ami il
    // crime" nella stessa home sono la stessa fila spezzata in due.
    const testa = testaDi(v[dimensione]);
    if (!testa) continue;
    const titolo = titoloDi(dimensione, testa.chiave, nomi);
    if (!titolo) continue;
    out.push({
      key: `${dimensione}|${testa.chiave}`,
      dimensione,
      chiave: testa.chiave,
      titolo,
      peso: testa.peso,
    });
  }
  return out;
}

/** `true` se il candidato appartiene davvero a questo scaffale. */
export function appartiene(spec: RailSpec, c: RankCandidate): boolean {
  switch (spec.dimensione) {
    case "persone":
      // solo chi ha quel nome fra regia e primi interpreti: `title_people` restituisce
      // esattamente quelli, e "Ancora con X" su una particina è una promessa tradita
      return c.people.includes(spec.chiave);
    case "generi":
      return c.genreIds.some((g) => String(g) === spec.chiave);
    case "decenni": {
      if (!c.year) return false;
      const anno = Number(c.year);
      if (!Number.isFinite(anno)) return false;
      return String(Math.floor(anno / 10) * 10) === spec.chiave;
    }
    default:
      return false;
  }
}
