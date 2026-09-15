/**
 * Che cos'e' ogni colonna di un export di cronologia. Prima si guarda il nome
 * (dizionario italiano/inglese), poi — quando il nome non dice niente, come
 * negli export Apple — si guarda il contenuto: la colonna con le stringhe piu'
 * lunghe e piu' uniche e' il titolo, quella con piu' date e' la data.
 *
 * Pura, coperta da Vitest: e' il pezzo che decide se un export si capisce.
 */

export type Ruolo =
  | "titolo"
  | "data"
  | "stagione"
  | "episodio"
  | "episodio_nome"
  | "durata"
  | "voto"
  | "tipo"
  | "anno"
  | "progresso";

/** Colonne che non ci servono mai: non devono rubare un ruolo per contenuto. */
const DA_IGNORARE =
  /(device|dispositivo|profil|ip\s*address|indirizzo|country|paese|browser|user\s*agent|subscription|abbonament|supplier|provider|url|link|id$)/i;

/** Nome della colonna -> ruolo. L'ordine conta: il primo che combacia vince. */
const PER_NOME: [RegExp, Ruolo][] = [
  [/(^|\b)(stagione|season)\b/i, "stagione"],
  [
    /(episode|episodio)\s*(title|name|nome|titolo)|(title|name|nome|titolo)\s*(episode|episodio)/i,
    "episodio_nome",
  ],
  [
    /(^|\b)(episodio|episode|ep)\b.*(numero|number|n\.?|#)|^(episodio|episode|ep)$/i,
    "episodio",
  ],
  [
    /(durata|duration|runtime|playback|played|watched\s*(time|seconds)|minut|second|\bms\b|millis)/i,
    "durata",
  ],
  [/(voto|rating|stars|score|valutazione)/i, "voto"],
  [/(progress|percent|percentuale|completion|position|posizione|offset)/i, "progresso"],
  [/(anno|year)/i, "anno"],
  [/(tipo|type|kind|media\s*type|content\s*type|categoria|category)/i, "tipo"],
  [/(data|date|watched|played|timestamp|ora|when|start)/i, "data"],
  [
    /(titolo|title|nome|name|show|serie|series|programma|content|item|movie|film)/i,
    "titolo",
  ],
];

/** Solo i ruoli che vale la pena indovinare guardando i valori. */
const PER_CONTENUTO: Ruolo[] = ["titolo", "data", "durata"];

/**
 * Punteggio minimo per assegnare un ruolo per contenuto: sotto questa soglia
 * il segnale e' troppo debole (poche righe combaciano) per fidarsene.
 */
const SOGLIA_PUNTEGGIO_CONTENUTO = 0.7;

export function durataSec(value: unknown): number | null {
  const testo = String(value ?? "").trim();
  if (testo === "") return null;
  const orologio = /^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/.exec(testo);
  if (orologio) {
    const [, a, b, c] = orologio;
    return c == null
      ? Number(a) * 60 + Number(b)
      : Number(a) * 3600 + Number(b) * 60 + Number(c);
  }
  if (!/^\d+([.,]\d+)?$/.test(testo)) return null;
  const n = Number(testo.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  // nessuna puntata dura piu' di un giorno: oltre, sono millisecondi
  return n > 86_400 ? Math.round(n / 1000) : Math.round(n);
}

export function sembraData(value: unknown): boolean {
  const testo = String(value ?? "").trim();
  if (testo === "") return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(testo)) return true;
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(testo)) return true;
  return false;
}

function quota(valori: string[], test: (v: string) => boolean): number {
  const pieni = valori.filter((v) => v.trim() !== "");
  if (pieni.length === 0) return 0;
  return pieni.filter(test).length / pieni.length;
}

/** Un valore che `durataSec` sa leggere e che non e' anche una data. */
function eDurataValida(v: string): boolean {
  return durataSec(v) != null && !sembraData(v);
}

/** Punteggio 0-1 di quanto una colonna somiglia a un ruolo, guardando i valori. */
function punteggioContenuto(ruolo: Ruolo, valori: string[]): number {
  if (ruolo === "data") return quota(valori, sembraData);
  if (ruolo === "durata") return quota(valori, eDurataValida);
  // titolo: testo lungo e vario, mai una data e mai un numero
  const testuale = quota(
    valori,
    (v) => v.trim().length >= 4 && !sembraData(v) && !/^\d+([.,]\d+)?$/.test(v),
  );
  const pieni = valori.filter((v) => v.trim() !== "");
  const unicita = pieni.length === 0 ? 0 : new Set(pieni).size / pieni.length;
  return testuale * unicita;
}

/**
 * Mediana dei secondi letti da una colonna candidata a "durata". Serve solo a
 * rompere un pareggio di punteggio: numeri piccoli come stagione/episodio
 * (es. "3", "2", "1") hanno una mediana bassa, le durate vere no — a
 * differenza di un pavimento assoluto, non scarta una colonna di durate
 * espresse in minuti (es. "22", "45", "58").
 */
function medianaSecondi(valori: string[]): number {
  const secondi = valori
    .filter(eDurataValida)
    .map((v) => durataSec(v) as number)
    .sort((a, b) => a - b);
  if (secondi.length === 0) return 0;
  const meta = Math.floor(secondi.length / 2);
  return secondi.length % 2 === 0
    ? (secondi[meta - 1] + secondi[meta]) / 2
    : secondi[meta];
}

export function profilaColonne(righe: Record<string, string>[]): Map<string, Ruolo> {
  const assegnati = new Map<string, Ruolo>();
  const presi = new Set<Ruolo>();
  if (righe.length === 0) return assegnati;

  const colonne = Object.keys(righe[0]);
  const campione = righe.slice(0, 200);
  const valoriDi = (col: string) => campione.map((r) => String(r[col] ?? ""));

  // 1. per nome
  for (const col of colonne) {
    if (DA_IGNORARE.test(col)) continue;
    const trovato = PER_NOME.find(([re]) => re.test(col));
    if (!trovato) continue;
    const [, ruolo] = trovato;
    if (presi.has(ruolo)) continue;
    assegnati.set(col, ruolo);
    presi.add(ruolo);
  }

  // 2. per contenuto, solo sui ruoli rimasti scoperti
  for (const ruolo of PER_CONTENUTO) {
    if (presi.has(ruolo)) continue;
    let miglior: { col: string; p: number } | null = null;
    for (const col of colonne) {
      if (assegnati.has(col) || DA_IGNORARE.test(col)) continue;
      const p = punteggioContenuto(ruolo, valoriDi(col));
      if (p <= SOGLIA_PUNTEGGIO_CONTENUTO) continue;
      if (miglior == null || p > miglior.p) {
        miglior = { col, p };
      } else if (
        ruolo === "durata" &&
        p === miglior.p &&
        medianaSecondi(valoriDi(col)) > medianaSecondi(valoriDi(miglior.col))
      ) {
        // pareggio sulla durata: vince la colonna con la mediana piu' alta
        miglior = { col, p };
      }
    }
    if (miglior) {
      assegnati.set(miglior.col, ruolo);
      presi.add(ruolo);
    }
  }
  return assegnati;
}
