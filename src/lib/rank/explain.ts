import type { Contributo } from "./types";

/**
 * Il motivo, in italiano, sotto la copertina.
 *
 * Un numero senza motivo non convince nessuno: "per te 92%" vale se accanto c'è
 * "Perché guardi molto Fantascienza". I nomi dei generi e dei provider arrivano già
 * tradotti da chi chiama (`getGenres`, `PROVIDERS`): qui dentro non deve entrare una
 * sola parola inglese.
 */

export interface NomiPerMotivo {
  /** id genere → nome italiano. */
  generi: Map<string, string>;
  /** id provider → nome. */
  provider: Map<string, string>;
}

/**
 * I generi che TMDB lascia in inglese anche con `language=it-IT`. Sono cinque, sono
 * sempre gli stessi, e senza questa mappa sotto le copertine compariva "Perché guardi
 * molto Action & Adventure" — visto in pagina il 2026-09-07, mai in un test.
 */
export const GENERI_IT: Record<string, string> = {
  "10759": "Azione e avventura",
  "10762": "Per bambini",
  "10763": "Notiziari",
  "10764": "Reality",
  "10765": "Fantascienza e fantasy",
  "10766": "Soap opera",
  "10767": "Talk show",
  "10768": "Guerra e politica",
};

/** Il nome italiano di un genere: la mappa qui sopra vince su quello di TMDB. */
export function nomeGenere(id: string, daTmdb: string | undefined): string | undefined {
  return GENERI_IT[id] ?? daTmdb;
}

/** Sotto questo contributo la dimensione non ha spinto abbastanza per essere citata. */
const SOGLIA = 0.04;
/** Qualità da cui in su vale la pena dire "molto amato" quando il gusto tace. */
const QUALITA_ALTA = 0.78;

export function explain(
  contributi: readonly Contributo[],
  nomi: NomiPerMotivo,
  qualita: number,
): string | null {
  const primo = contributi.find((c) => c.valore >= SOGLIA);

  if (primo) {
    switch (primo.dimensione) {
      case "generi": {
        const nome = nomi.generi.get(primo.chiave);
        if (nome) return `Perché guardi molto ${nome}`;
        break;
      }
      case "persone": {
        const [ruolo, ...resto] = primo.chiave.split(":");
        const nome = resto.join(":");
        if (nome) return ruolo === "Regia" ? `Di ${nome}` : `Con ${nome}`;
        break;
      }
      case "provider": {
        const nome = nomi.provider.get(primo.chiave);
        if (nome) return `Su ${nome}, che guardi spesso`;
        break;
      }
      case "decenni":
        return `Dagli anni ${primo.chiave}`;
      case "lingua":
      case "tipo":
      case "runtime":
        // Vere per il modello, banali da leggere ("perché guardi film"): si tace.
        break;
    }
  }

  return qualita >= QUALITA_ALTA ? "Molto amato su Zapp" : null;
}

/**
 * Lo stesso motivo su otto copertine di dieci non è una spiegazione: è un rumore di
 * fondo (visto per davvero nelle liste stampate il 2026-09-07 — "Perché guardi molto
 * Dramma" ripetuto per tutta la fila). Dalla terza volta si prova il contributo
 * successivo, e se non c'è si tace: meglio nessun motivo che un ritornello.
 */
export function variaMotivi<
  T extends { contributi: readonly Contributo[]; motivo: string | null },
>(items: T[], nomi: NomiPerMotivo, qualita: (item: T) => number, massimo = 2): T[] {
  const usati = new Map<string, number>();
  return items.map((item) => {
    let motivo = item.motivo;
    if (motivo && (usati.get(motivo) ?? 0) >= massimo) {
      const alternativo = item.contributi
        .slice(1)
        .map((c) => explain([c], nomi, 0))
        .find((m) => m !== null && (usati.get(m) ?? 0) < massimo);
      motivo = alternativo ?? (qualita(item) >= 0.78 ? "Molto amato su Zapp" : null);
      if (motivo && (usati.get(motivo) ?? 0) >= massimo) motivo = null;
    }
    if (motivo) usati.set(motivo, (usati.get(motivo) ?? 0) + 1);
    return { ...item, motivo };
  });
}
