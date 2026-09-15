import { PLATFORMS, platformByKey } from "./catalog";

/**
 * Una card di `/benvenuto`: una piattaforma, una sola azione (il link primario),
 * più il rientro verso l'import del file quando la richiesta è tornata.
 */
export interface AzionePiattaforma {
  key: string;
  /** Il nome del servizio (`pillola` del catalogo: "Infinity", non "Mediaset Infinity"). */
  nome: string;
  /** Titolo dell'azione, non del servizio: "Scarica la cronologia", non "Netflix". */
  titolo: string;
  /** Una riga: cosa succede cliccando il link primario. */
  dettaglio: string;
  /** Quanto ci vuole, in parole: è quello che fa scegliere da dove cominciare. */
  tempo: string;
  href: string | null;
  /** Sempre `true` in pratica: sono tutti link fuori da Zapp (sito o email). */
  esterno: boolean;
  /** Slug della sorgente di import dove tornare col file, o `null` se non c'è. */
  caricaSlug: string | null;
}

type Categoria = "subito" | "attesa";

interface Definizione {
  key: string;
  categoria: Categoria;
  titolo: string;
  dettaglio: string;
  tempo: string;
  href: string;
  caricaSlug: string;
}

/**
 * Il corpo della richiesta d'accesso a NOW/Sky: **non esiste un portale
 * self-service** (verificato il 2026-09-15), quindi l'unica strada è scrivere a
 * `privacy@sky.it`. Lasciare che sia l'utente a inventarsi da solo una richiesta
 * ai sensi del GDPR significa che quasi nessuno la scrive: l'email arriva già
 * pronta, con l'oggetto e la cronologia di visione nominata esplicitamente.
 */
const OGGETTO_NOW = "Richiesta di accesso ai dati personali (art. 15 GDPR)";
const CORPO_NOW = [
  "Buongiorno,",
  "",
  "chiedo, ai sensi dell'articolo 15 del Regolamento (UE) 2016/679 (GDPR),",
  "l'accesso ai miei dati personali legati al mio account NOW/Sky, in",
  "particolare alla mia cronologia di visione (i titoli guardati e le relative",
  "date).",
  "",
  "Vi chiedo di inviarmi una copia di questi dati in un formato leggibile.",
  "",
  "Grazie,",
].join("\n");
const HREF_NOW = `mailto:privacy@sky.it?subject=${encodeURIComponent(
  OGGETTO_NOW,
)}&body=${encodeURIComponent(CORPO_NOW)}`;

/**
 * Le cinque piattaforme che hanno una strada per importare la cronologia,
 * **ordinate per quanto ci mettono**: prima chi si chiude da sé (Netflix scarica
 * la cronologia dalla propria pagina, senza chiedere niente a nessuno), poi le
 * richieste che aprono un'attesa, dalla più corta alla più lunga. Gli indirizzi
 * sono verificati il 2026-09-15: non vanno cercati altrove né "aggiornati" a
 * occhio.
 */
const DEFINIZIONI: Definizione[] = [
  {
    key: "netflix",
    categoria: "subito",
    titolo: "Scarica la cronologia",
    dettaglio: "È già pronta sulla tua pagina Netflix: la scarichi e la carichi qui.",
    tempo: "un minuto",
    href: "https://www.netflix.com/viewingactivity",
    caricaSlug: "netflix",
  },
  {
    key: "prime-video",
    categoria: "attesa",
    titolo: "Chiedi i tuoi dati ad Amazon",
    dettaglio: "Il centro privacy di Amazon prepara un file da scaricare.",
    tempo: "qualche giorno",
    href: "https://www.amazon.it/hz/privacy-central/data-requests/preview.html",
    caricaSlug: "export",
  },
  {
    key: "apple-tv",
    categoria: "attesa",
    titolo: "Chiedi i tuoi dati ad Apple",
    dettaglio: "Il portale privacy di Apple prepara un archivio da scaricare.",
    tempo: "3-7 giorni",
    href: "https://privacy.apple.com",
    caricaSlug: "export",
  },
  {
    key: "disney-plus",
    categoria: "attesa",
    titolo: "Chiedi i tuoi dati a Disney",
    dettaglio: "Il portale dei diritti sui dati di Disney prepara un export.",
    tempo: "fino a 30 giorni",
    href: "https://privacy.thewaltdisneycompany.com/en/current-privacy-policy/data-subject-rights-portal/",
    caricaSlug: "export",
  },
  {
    key: "now",
    categoria: "attesa",
    titolo: "Scrivi a Sky",
    dettaglio: "NOW non ha un portale: l'email della richiesta arriva già scritta.",
    tempo: "fino a 30 giorni",
    href: HREF_NOW,
    caricaSlug: "export",
  },
];

/**
 * Le azioni per le piattaforme dichiarate da questo utente (`chiavi`), pura e
 * senza I/O: `subito` prima di `attesa`, ognuna nell'ordine di `DEFINIZIONI`
 * (per quanto ci mettono). `senzaStrada` porta i **nomi** (`pillola` del
 * catalogo) delle piattaforme dichiarate che non hanno un export, per la riga
 * sola in fondo alla pagina — non le chiavi, che lì non servono a nessuno.
 * Una chiave che non esiste nel catalogo (mai dovrebbe arrivare da
 * `getUserPlatforms`, ma questa funzione non si fida) non produce niente in
 * nessuno dei tre elenchi.
 */
export function azioniPer(chiavi: string[]): {
  subito: AzionePiattaforma[];
  attesa: AzionePiattaforma[];
  senzaStrada: string[];
} {
  const dichiarate = new Set(chiavi);
  const conStrada = new Set(DEFINIZIONI.map((d) => d.key));

  const subito: AzionePiattaforma[] = [];
  const attesa: AzionePiattaforma[] = [];

  for (const def of DEFINIZIONI) {
    if (!dichiarate.has(def.key)) continue;
    const piattaforma = platformByKey(def.key);
    if (!piattaforma) continue;
    const azione: AzionePiattaforma = {
      key: def.key,
      nome: piattaforma.pillola,
      titolo: def.titolo,
      dettaglio: def.dettaglio,
      tempo: def.tempo,
      href: def.href,
      esterno: true,
      caricaSlug: def.caricaSlug,
    };
    (def.categoria === "subito" ? subito : attesa).push(azione);
  }

  const senzaStrada = PLATFORMS.filter(
    (p) => dichiarate.has(p.key) && !conStrada.has(p.key),
  ).map((p) => p.pillola);

  return { subito, attesa, senzaStrada };
}

/** Le tre forme di una card "ad attesa" di `/benvenuto`. */
export type StatoCardAttesa = "da-fare" | "richiesta" | "importata";

/**
 * Una card "ad attesa" con la forma già decisa da `cardsAttesa`: stessa
 * forma di `AzionePiattaforma`, più lo stato e — solo quando `stato` è
 * `"richiesta"` — le due date da mostrare (ISO `YYYY-MM-DD`: chi rende la
 * pagina le formatta, questa funzione resta pura e non sa di fusi orari).
 */
export interface CardAttesa extends AzionePiattaforma {
  stato: StatoCardAttesa;
  richiestaIl: string | null;
  arrivoAtteso: string | null;
}

/**
 * La sola parte di una riga di `import_requests` (vedi `RichiestaImport` in
 * `src/lib/import/richieste-store.ts`, che è server-only) che serve a
 * decidere lo stato di una card: ripetuta qui, non importata, perché questo
 * modulo resta puro e Vitest non gira in ambiente server.
 */
export interface RichiestaStato {
  platformKey: string;
  requestedAt: string;
  expectedAt: string;
  state: "requested" | "imported" | "dismissed";
}

/**
 * Le card "ad attesa" di `/benvenuto`, ciascuna nella sua forma — **da fare**
 * (nessuna richiesta), **richiesta** (in attesa, con le date) o **importata**
 * (il file è già stato caricato) — e già ordinate: pura, prende le chiavi
 * dichiarate e le richieste dell'utente **di qualunque stato** (non filtrate
 * a monte, è questa funzione a decidere), non fa I/O. Una piattaforma con più
 * righe in `richieste` prende la prima che trova: in pratica non succede,
 * l'indice unico di `import_requests` garantisce una sola richiesta aperta
 * per piattaforma e `chiudiRichieste` la chiude a `imported` invece di
 * aprirne un'altra.
 *
 * Ordine: prima le card ancora da fare o in attesa (nell'ordine di
 * `azioniPer`, cioè per quanto ci mettono — "quelle che si fanno subito"),
 * poi le importate in fondo, spente: sono fatte, non c'è più niente da
 * decidere lì.
 */
export function cardsAttesa(chiavi: string[], richieste: RichiestaStato[]): CardAttesa[] {
  const { attesa } = azioniPer(chiavi);
  const perChiave = new Map(richieste.map((r) => [r.platformKey, r]));

  const decise = attesa.map((azione): CardAttesa => {
    const richiesta = perChiave.get(azione.key);
    if (richiesta?.state === "imported") {
      return { ...azione, stato: "importata", richiestaIl: null, arrivoAtteso: null };
    }
    if (richiesta?.state === "requested") {
      return {
        ...azione,
        stato: "richiesta",
        richiestaIl: richiesta.requestedAt,
        arrivoAtteso: richiesta.expectedAt,
      };
    }
    return { ...azione, stato: "da-fare", richiestaIl: null, arrivoAtteso: null };
  });

  const attive = decise.filter((c) => c.stato !== "importata");
  const importate = decise.filter((c) => c.stato === "importata");
  return [...attive, ...importate];
}
