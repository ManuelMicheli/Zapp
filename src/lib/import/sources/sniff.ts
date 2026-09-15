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

/**
 * Colonne che non ci servono mai: non devono rubare un ruolo per contenuto.
 *
 * Le classificazioni per eta' (`Maturity Rating`, `Age Rating`, `VM14`) stanno
 * qui perche' il nome contiene "rating" e i valori sono numeri piccoli: senza
 * escluderle si prendevano il ruolo `voto` e scrivevano in libreria un voto
 * inventato su centinaia di titoli, che poi alimenta il profilo di gusto.
 */
const DA_IGNORARE =
  /(device|dispositivo|profil|ip\s*address|indirizzo|country|paese|browser|user\s*agent|subscription|abbonament|supplier|provider|url|link|maturity|age\s*rating|content\s*rating|parental|certificat|classificaz|censur|\bvm\s*\d+|et[aà]'?\s*(consigliat|minim)|id$)/i;

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

/**
 * Nomi che contengono la parola del ruolo ma parlano d'altro. Tenuto separato
 * da `DA_IGNORARE` perche' qui la colonna resta viva: perde solo *quel* ruolo.
 */
const NON_PER_RUOLO: Partial<Record<Ruolo, RegExp>> = {
  // "Watch Year" / "Anno visione" e' l'anno in cui l'utente ha guardato, non
  // quello del titolo: usato come anno del film filtra via ogni riconoscimento
  // (nessun film del 2026 quando l'utente l'ha visto nel 2026).
  anno: /(watch|view|play|visio|guardat|riprod)/i,
};

/** Solo i ruoli che vale la pena indovinare guardando i valori. */
const PER_CONTENUTO: Ruolo[] = ["titolo", "data", "durata"];

/**
 * Punteggio minimo per assegnare un ruolo per contenuto: sotto questa soglia
 * il segnale e' troppo debole (poche righe combaciano) per fidarsene.
 */
const SOGLIA_PUNTEGGIO_CONTENUTO = 0.7;

/**
 * Mediana minima (in secondi) perche' una colonna riconosciuta **per
 * contenuto** valga come "durata". Senza questo pavimento, una colonna opaca
 * di numeri piccoli (es. numeri di episodio 1..24, mediana ~12) vincerebbe il
 * ruolo per assenza di concorrenza — nessuna colonna di durata vera a fare
 * pareggio, quindi la mediana da sola non basta a scartarla. Il danno e'
 * grave: il task che legge queste righe scarta come anteprima tutto cio' che
 * sta sotto i 120 secondi di "durata", quindi un intero import verrebbe
 * silenziosamente svuotato. Il riconoscimento **per nome** non passa da qui:
 * se l'intestazione dice "Duration" ci si fida a prescindere dai valori.
 * 20s separa i due casi osservati: minuti veri (22/45/58 -> mediana 45) restano
 * dentro, numeri di episodio (1..24 -> mediana ~12) restano fuori.
 */
const SOGLIA_MEDIANA_DURATA_SEC = 20;

/**
 * In che unita' conta una colonna di durata. Le piattaforme non sono d'accordo:
 * Apple scrive secondi o millisecondi, chi pubblica un "Minutes watched" conta
 * minuti, qualcuno conta ore. Chi legge la colonna deve saperlo, altrimenti la
 * soglia anti-anteprima (`DURATA_MINIMA_SEC` in `export.ts`) confronta minuti
 * con secondi e butta via l'import intero.
 */
export type UnitaDurata = "secondi" | "minuti" | "ore";

const FATTORE: Record<UnitaDurata, number> = { secondi: 1, minuti: 60, ore: 3600 };

/**
 * Sotto questa mediana (in "unita' della colonna") i numeri non possono essere
 * secondi di visione: cinque minuti e' gia' poco per una puntata, e un file
 * intero che ci sta sotto vorrebbe dire che l'utente ha solo aperto e chiuso.
 * Molto piu' probabile che stia contando minuti. Vale solo dove il nome della
 * colonna non dichiara l'unita'.
 */
const SOGLIA_MEDIANA_SECONDI_VERI = 300;

/** L'unita' dichiarata dal nome della colonna, quando la dichiara. */
function unitaDalNome(nome: string): UnitaDurata | null {
  if (/(minut|\bmin\b|\bmins\b|\bm\b)/i.test(nome)) return "minuti";
  if (/(hour|\bore\b|\bora\b|\bhrs?\b|\bh\b)/i.test(nome)) return "ore";
  if (/(second|\bsec\b|\bsecs\b|\bms\b|millis)/i.test(nome)) return "secondi";
  return null;
}

/**
 * L'unita' di una colonna di durata: prima quello che dice il nome, poi — per
 * le colonne riconosciute solo dal contenuto, dove il nome non dice niente —
 * la mediana dei valori. Il default resta "secondi": e' la forma piu' comune.
 */
export function unitaDurata(nome: string, valori: string[]): UnitaDurata {
  const dichiarata = unitaDalNome(nome);
  if (dichiarata) return dichiarata;
  const mediana = medianaSecondi(valori);
  if (mediana > 0 && mediana < SOGLIA_MEDIANA_SECONDI_VERI) return "minuti";
  return "secondi";
}

/**
 * Secondi veri da un valore di durata. `unita` moltiplica **solo** i numeri
 * nudi: un orologio (`01:02:03`) e' gia' in secondi per costruzione, e un
 * numero cosi' grande da non poter essere secondi sono millisecondi.
 */
export function durataSec(value: unknown, unita: UnitaDurata = "secondi"): number | null {
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
  if (unita === "secondi" && n > 86_400) return Math.round(n / 1000);
  return Math.round(n * FATTORE[unita]);
}

/**
 * Epoch che gli export usano davvero: 10 cifre (secondi) o 13 (millisecondi).
 * Un intervallo stretto di proposito — un numero qualunque non e' una data.
 */
export const EPOCH = /^\d{10}$|^\d{13}$/;

export function sembraData(value: unknown): boolean {
  const testo = String(value ?? "").trim();
  if (testo === "") return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(testo)) return true;
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(testo)) return true;
  return EPOCH.test(testo);
}

/** Scala del voto dichiarata dal nome della colonna, quando la dichiara. */
export function scalaVotoDalNome(nome: string): number | null {
  if (/(\/\s*100\b|\bsu\s*100\b|percent|percentual)/i.test(nome)) return 100;
  if (/(\/\s*10\b|\bsu\s*10\b)/i.test(nome)) return 10;
  if (/(star|stelle)/i.test(nome)) return 5;
  if (/(\/\s*5\b|\bsu\s*5\b)/i.test(nome)) return 5;
  return null;
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

/**
 * Quota minima di valori plausibili perche' una colonna presa **per nome**
 * tenga il ruolo di durata o di data. Il riconoscimento per nome non guardava
 * mai i valori: "Playback Date" e "Last Played" combaciano con la regex della
 * durata (contiene `playback` e `played`) e venivano prima di quella della
 * data, cosi' si prendevano il ruolo sbagliato e la colonna della data restava
 * orfana per tutto il file — il passo per contenuto non la riprovava, perche'
 * la colonna risultava gia' assegnata. Sotto questa quota il nome non basta:
 * la colonna resta libera e ci ripensa il contenuto.
 */
const SOGLIA_QUOTA_NOME = 0.5;

export function profilaColonne(righe: Record<string, string>[]): Map<string, Ruolo> {
  const assegnati = new Map<string, Ruolo>();
  const presi = new Set<Ruolo>();
  if (righe.length === 0) return assegnati;

  const campione = righe.slice(0, 200);
  // l'unione delle chiavi del campione, non quelle della prima riga: in un CSV
  // le intestazioni sono uguali per tutti, in un JSON no — i campi vuoti si
  // omettono, ed e' la forma normale degli export. Con la prima riga sola, un
  // film in cima faceva sparire `season`/`episode` per l'intero file, e le
  // serie entravano in libreria come film a S1E1.
  const colonne = [...new Set(campione.flatMap((r) => Object.keys(r)))];
  const valoriDi = (col: string) => campione.map((r) => String(r[col] ?? ""));

  // 1. per nome
  for (const col of colonne) {
    if (DA_IGNORARE.test(col)) continue;
    const trovato = PER_NOME.find(([re]) => re.test(col));
    if (!trovato) continue;
    const [, ruolo] = trovato;
    if (presi.has(ruolo)) continue;
    if (NON_PER_RUOLO[ruolo]?.test(col)) continue;
    if (ruolo === "durata" || ruolo === "data") {
      const test = ruolo === "durata" ? eDurataValida : sembraData;
      if (quota(valoriDi(col), test) < SOGLIA_QUOTA_NOME) continue;
    }
    assegnati.set(col, ruolo);
    presi.add(ruolo);
  }

  // 2. per contenuto, solo sui ruoli rimasti scoperti
  for (const ruolo of PER_CONTENUTO) {
    if (presi.has(ruolo)) continue;
    let miglior: { col: string; p: number; mediana: number } | null = null;
    for (const col of colonne) {
      if (assegnati.has(col) || DA_IGNORARE.test(col)) continue;
      const valori = valoriDi(col);
      const p = punteggioContenuto(ruolo, valori);
      if (p <= SOGLIA_PUNTEGGIO_CONTENUTO) continue;
      const mediana = ruolo === "durata" ? medianaSecondi(valori) : 0;
      if (ruolo === "durata" && mediana < SOGLIA_MEDIANA_DURATA_SEC) continue;
      if (miglior == null || p > miglior.p) {
        miglior = { col, p, mediana };
      } else if (ruolo === "durata" && p === miglior.p && mediana > miglior.mediana) {
        // pareggio sulla durata: vince la colonna con la mediana piu' alta
        miglior = { col, p, mediana };
      }
    }
    if (miglior) {
      assegnati.set(miglior.col, ruolo);
      presi.add(ruolo);
    }
  }
  return assegnati;
}
