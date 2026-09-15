"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { lasciaPosto, prendiPosto } from "@/lib/gate";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import {
  ARCHIVIO_TROPPO_GRANDE,
  MAX_UNZIPPED_STORAGE_BYTES,
  nuovoBudget,
  unzipSources,
} from "@/lib/import/archive";
import {
  matchCandidates,
  type ImportCandidate,
  type ImportProposal,
} from "@/lib/import/match";
import {
  isSourceSlug,
  parseSource,
  SOURCES,
  type SourceSlug,
} from "@/lib/import/sources/registry";
import type { SourceFile } from "@/lib/import/sources/types";
import { chiudiRichieste, richiesteAperte } from "@/lib/import/richieste-store";
import { availableSeasons, isLastEpisode } from "@/lib/watch/episodes";
import { isIntInRange, isMediaType, isTmdbId } from "@/lib/validate";
import { CSV_INVALID_MESSAGE } from "./messages";
import {
  CONFIRM_CHUNK_SIZE,
  MATCH_CHUNK_SIZE,
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  MAX_UPLOAD_FILES,
} from "./limits";

/** Quello che si dice all'utente quando lo zip non si apre, qualunque sia il motivo. */
const ARCHIVIO_ILLEGGIBILE = "Archivio illeggibile: non sembra uno zip valido.";

/** Quante `getOrFetchTitle` in parallelo dentro un blocco (il client TMDB ha già il throttle). */
const CONFIRM_CONCURRENCY = 5;

/** Cosa mostrare all'utente quando l'archivio non si apre. */
function erroreArchivio(e: unknown): string {
  // il tetto sta dentro al messaggio (cambia col percorso), quindi si riconosce
  // per prefisso; tutto il resto viene da fflate ed è in inglese
  return e instanceof Error && e.message.startsWith(ARCHIVIO_TROPPO_GRANDE)
    ? e.message
    : ARCHIVIO_ILLEGGIBILE;
}

/**
 * Il percorso lo scrive il client: deve essere **esattamente**
 * `<uid>/<cartella>/<file>`. `startsWith("<uid>/")` non bastava — lasciava
 * passare `<uid>/../<altro-uid>/file`, che la RLS blocca ma che questo
 * controllo diceva di aver già escluso.
 */
function percorsoDellUtente(path: string, userId: string): boolean {
  const parti = path.split("/");
  return (
    parti.length === 3 &&
    parti[0] === userId &&
    parti.every((p) => p !== "" && p !== "." && p !== "..")
  );
}

/** Quanto può restare al massimo un file caricato e mai letto. */
const SCADENZA_CARICATI_MS = 24 * 60 * 60 * 1000;
/** Quante cartelle abbandonate guardare in un giro di pulizia. */
const MAX_CARTELLE_SPAZZATE = 25;

/**
 * Rete di sicurezza per la promessa fatta in pagina ("il file viene cancellato
 * appena letto"): i file che un import precedente non ha cancellato — la
 * funzione è morta a metà, il browser è stato chiuso fra l'upload e il parsing
 * — non possono restare per sempre in un bucket di cronologia personale.
 * All'inizio di ogni import si buttano quelli più vecchi di un giorno: solo la
 * cartella dell'utente, dentro la sua RLS, così non serve un cron. Non può far
 * fallire l'import: qualunque errore qui si ignora.
 */
async function spazzaCaricatiVecchi(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  try {
    const bucket = supabase.storage.from("import-uploads");
    const { data: cartelle } = await bucket.list(userId, {
      limit: MAX_CARTELLE_SPAZZATE,
    });
    if (!cartelle || cartelle.length === 0) return;
    const limite = Date.now() - SCADENZA_CARICATI_MS;
    const vecchi: string[] = [];
    for (const cartella of cartelle) {
      const { data: dentro } = await bucket.list(`${userId}/${cartella.name}`, {
        limit: 100,
      });
      for (const f of dentro ?? []) {
        const quando = Date.parse(f.created_at ?? f.updated_at ?? "");
        if (Number.isFinite(quando) && quando < limite) {
          vecchi.push(`${userId}/${cartella.name}/${f.name}`);
        }
      }
    }
    if (vecchi.length > 0) await bucket.remove(vecchi);
  } catch {
    // la pulizia è un di più: non deve mai impedire un import
  }
}

export interface ParseResult {
  ok: boolean;
  error?: string;
  candidates: ImportCandidate[];
  totalRows: number;
  /** Cosa il parser ha ignorato o non capito: non ferma l'import, va mostrato. */
  avvisi?: string[];
}

/**
 * Quanti import possono girare insieme in tutta l'app. Un import sono migliaia
 * di chiamate a TMDB: il throttle del client TMDB e' per istanza, quindi cinque
 * import in parallelo sono cinque throttle indipendenti e TMDB comincia a
 * rispondere 429 a tutti, anche a chi sta solo navigando.
 */
const POSTI_IMPORT = 3;
/** Un import lasciato a meta' libera il posto da solo dopo mezz'ora. */
const TTL_IMPORT_S = 1800;

/**
 * Parsing in memoria: nessun file viene salvato né loggato. Gli zip si aprono
 * qui (`unzipSources`), i csv/json si leggono come testo; poi tutto passa al
 * parser della sorgente. Il riconoscimento su TMDB avviene a blocchi con
 * `matchImportCandidates`.
 */
export async function parseImportFiles(formData: FormData): Promise<ParseResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", candidates: [], totalRows: 0 };

  const slugRaw = String(formData.get("source") ?? "");
  if (!isSourceSlug(slugRaw)) {
    return { ok: false, error: "Sorgente sconosciuta", candidates: [], totalRows: 0 };
  }
  const slug: SourceSlug = slugRaw;

  // Un import intero e' gia' centinaia di chiamate TMDB: senza tetto orario
  // bastava rilanciarlo in continuazione per bruciare la quota condivisa.
  if (!(await rateLimit(`import:parse:${user.id}`, 20, 3600, { condiviso: true }))) {
    return {
      ok: false,
      error: "Troppi import ravvicinati, riprova piu' tardi",
      candidates: [],
      totalRows: 0,
    };
  }
  if (!(await prendiPosto("import", user.id, POSTI_IMPORT, TTL_IMPORT_S))) {
    return {
      ok: false,
      error: "Ci sono gia' tre import in corso, riprova fra qualche minuto",
      candidates: [],
      totalRows: 0,
    };
  }

  const uploaded = formData.getAll("file").filter((f): f is File => f instanceof File);
  if (uploaded.length === 0) {
    await lasciaPosto("import", user.id);
    return { ok: false, error: "Nessun file", candidates: [], totalRows: 0 };
  }
  if (uploaded.length > MAX_UPLOAD_FILES) {
    await lasciaPosto("import", user.id);
    return {
      ok: false,
      error: `Troppi file insieme (massimo ${MAX_UPLOAD_FILES})`,
      candidates: [],
      totalRows: 0,
    };
  }
  // Il filtro del client non e' un controllo: una Server Action e' un endpoint
  // HTTP e non ha nessun client davanti. Le estensioni buone sono quelle che la
  // sorgente dichiara, `accetta`, che e' anche quello che filtra l'input file.
  const estensioni = SOURCES[slug].accetta
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.startsWith("."));
  if (
    uploaded.some((f) => !estensioni.some((ext) => f.name.toLowerCase().endsWith(ext)))
  ) {
    await lasciaPosto("import", user.id);
    return {
      ok: false,
      error: `Questa sorgente accetta ${estensioni.join(" o ")}`,
      candidates: [],
      totalRows: 0,
    };
  }

  // sulla somma, non sul singolo file: quello che ha un tetto e' il corpo della
  // richiesta (vedi `bodySizeLimit` in next.config.ts)
  if (uploaded.reduce((somma, f) => somma + f.size, 0) > MAX_FILE_BYTES) {
    await lasciaPosto("import", user.id);
    return {
      ok: false,
      error: `I file superano ${MAX_FILE_LABEL} in tutto`,
      candidates: [],
      totalRows: 0,
    };
  }

  // un solo tetto di decompressione per tutta la richiesta: con un budget per
  // archivio bastavano N zip nella stessa chiamata per avere N volte 10MB
  const budget = nuovoBudget();
  const files: SourceFile[] = [];
  for (const file of uploaded) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      try {
        files.push(...unzipSources(new Uint8Array(await file.arrayBuffer()), budget));
      } catch (e) {
        await lasciaPosto("import", user.id);
        // fuori di qui va solo un messaggio nostro: fflate racconta in inglese
        // com'e' fatto lo zip ("invalid zip data", "unknown compression type")
        return {
          ok: false,
          error: erroreArchivio(e),
          candidates: [],
          totalRows: 0,
        };
      }
    } else {
      files.push({ name: file.name, text: await file.text() });
    }
  }

  const parsed = parseSource(slug, files);
  if (parsed.candidates.length === 0) {
    await lasciaPosto("import", user.id);
    return {
      ok: false,
      error: parsed.error ?? CSV_INVALID_MESSAGE,
      candidates: [],
      totalRows: 0,
      avvisi: parsed.avvisi,
    };
  }
  // gli avvisi passano anche di qui: le due action hanno lo stesso tipo di
  // ritorno, e chi le chiama non deve indovinare quale delle due li porta
  return {
    ok: true,
    candidates: parsed.candidates,
    totalRows: parsed.rows,
    avvisi: parsed.avvisi,
  };
}

/**
 * Come `parseImportFiles`, ma il file è già nel bucket `import-uploads`: il
 * client lo carica da solo (upload diretto, senza passare dal corpo della
 * Server Action), la action riceve solo il percorso. Serve per gli export veri
 * (decine di MB) e perché da telefono non si può chiedere di aprire uno zip
 * per estrarne un csv.
 */
export async function parseImportFromStorage(
  paths: string[],
  source: string,
): Promise<ParseResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", candidates: [], totalRows: 0 };

  // cronologia personale: il file non deve restare nel bucket, qualunque sia
  // l'uscita. La pulizia si definisce **prima** dei controlli d'ingresso:
  // "troppi import ravvicinati" e "ci sono già tre import in corso" capitano
  // nell'uso normale, e uscendo di lì il file caricato restava nel bucket per
  // sempre. Si cancellano solo i percorsi che sono davvero dell'utente.
  const miei = paths.filter((p) => percorsoDellUtente(p, user.id));
  const pulisci = async () => {
    if (miei.length > 0) await supabase.storage.from("import-uploads").remove(miei);
  };
  if (!isSourceSlug(source)) {
    await pulisci();
    return { ok: false, error: "Sorgente sconosciuta", candidates: [], totalRows: 0 };
  }
  if (paths.length === 0) {
    return { ok: false, error: "Nessun file", candidates: [], totalRows: 0 };
  }
  if (paths.length > MAX_UPLOAD_FILES) {
    await pulisci();
    return {
      ok: false,
      error: `Troppi file insieme (massimo ${MAX_UPLOAD_FILES})`,
      candidates: [],
      totalRows: 0,
    };
  }
  // il percorso lo scrive il client: qui si verifica che sia suo, come farebbe
  // comunque la RLS del bucket, ma prima di spendere un tentativo di download
  if (miei.length !== paths.length) {
    await pulisci();
    return { ok: false, error: "Percorso non valido", candidates: [], totalRows: 0 };
  }
  // stessa chiave del percorso a corpo: un tetto solo sulla frequenza di
  // parsing, non due contatori indipendenti da tenere sincronizzati
  if (!(await rateLimit(`import:parse:${user.id}`, 20, 3600, { condiviso: true }))) {
    await pulisci();
    return {
      ok: false,
      error: "Troppi import ravvicinati, riprova piu' tardi",
      candidates: [],
      totalRows: 0,
    };
  }
  if (!(await prendiPosto("import", user.id, POSTI_IMPORT, TTL_IMPORT_S))) {
    await pulisci();
    return {
      ok: false,
      error: "Ci sono gia' tre import in corso, riprova fra qualche minuto",
      candidates: [],
      totalRows: 0,
    };
  }

  // l'import vero comincia qui: si butta quello che un import precedente ha
  // lasciato indietro. Dopo il rate limit, così non diventa un modo per far
  // fare due `list` allo Storage a ogni richiesta.
  await spazzaCaricatiVecchi(supabase, user.id);

  try {
    // qui il tetto non è il corpo della richiesta (il file non ci passa) ma la
    // memoria della funzione: vedi `MAX_UNZIPPED_STORAGE_BYTES`
    const budget = nuovoBudget(MAX_UNZIPPED_STORAGE_BYTES);
    const files: SourceFile[] = [];
    for (const path of paths) {
      const { data, error } = await supabase.storage
        .from("import-uploads")
        .download(path);
      if (error || !data) {
        // il posto va restituito su OGNI uscita: senza, l'import resta
        // bloccato mezz'ora senza un errore visibile
        await lasciaPosto("import", user.id);
        await pulisci();
        return {
          ok: false,
          error: "Non riesco a rileggere il file caricato",
          candidates: [],
          totalRows: 0,
        };
      }
      const nome = path.split("/").pop() ?? path;
      if (nome.toLowerCase().endsWith(".zip")) {
        files.push(...unzipSources(new Uint8Array(await data.arrayBuffer()), budget));
      } else {
        files.push({ name: nome, text: await data.text() });
      }
    }

    const parsed = parseSource(source, files);
    await pulisci();
    if (parsed.candidates.length === 0) {
      await lasciaPosto("import", user.id);
      return {
        ok: false,
        error: parsed.error ?? CSV_INVALID_MESSAGE,
        candidates: [],
        totalRows: 0,
        avvisi: parsed.avvisi,
      };
    }
    return {
      ok: true,
      candidates: parsed.candidates,
      totalRows: parsed.rows,
      avvisi: parsed.avvisi,
    };
  } catch (e) {
    await lasciaPosto("import", user.id);
    await pulisci();
    return {
      ok: false,
      error: erroreArchivio(e),
      candidates: [],
      totalRows: 0,
    };
  }
}

export interface MatchResult {
  ok: boolean;
  error?: string;
  proposals: ImportProposal[];
}

/** Riconosce su TMDB un blocco di candidati (max `MATCH_CHUNK_SIZE`). */
export async function matchImportCandidates(
  candidates: ImportCandidate[],
): Promise<MatchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", proposals: [] };
  if (!Array.isArray(candidates) || candidates.length > MATCH_CHUNK_SIZE) {
    return { ok: false, error: "Blocco troppo grande", proposals: [] };
  }
  // Un import da 6000 righe sono ~200 blocchi: il tetto e' largo per l'uso vero
  // e stretto per chi volesse usare l'app come proxy verso TMDB.
  if (!(await rateLimit(`import:match:${user.id}`, 1500, 3600, { condiviso: true }))) {
    return { ok: false, error: "Troppe richieste, riprova piu' tardi", proposals: [] };
  }
  return { ok: true, proposals: await matchCandidates(candidates) };
}

export interface ConfirmItem {
  tmdbId: number;
  kind: "movie" | "tv";
  season: number | null;
  episode: number | null;
  lastDate: string | null;
  /** Voto della sorgente sulla scala di Zapp (1-10), o null. */
  rating: number | null;
  /**
   * "want" = watchlist: si scrive solo se il titolo non è già in libreria.
   * "watching" = visione lasciata a metà (export con colonna di avanzamento,
   * vedi `sources/export.ts`); per un film già "watched" non può mai
   * retrocederlo, vedi `hasNewProgress` e il guard della RPC (migration 0059).
   */
  status: "watched" | "want" | "watching";
}

export interface ConfirmResult {
  ok: boolean;
  error?: string;
  written: number;
  skipped: number;
}

/** Ultimo blocco: registra la riga in `imports` e invalida le pagine. */
export interface ConfirmFinal {
  totalRows: number;
  /** Titoli scritti nei blocchi precedenti (per il totale in `imports.matched`). */
  writtenBefore: number;
  source: SourceSlug;
}

/** Riga già in libreria, per decidere se il CSV porta qualcosa di nuovo. */
interface ExistingEntry {
  status: string;
  rating: number | null;
  season_number: number | null;
  episode_number: number | null;
  started_at: string | null;
}

/**
 * Il CSV porta qualcosa che non c'è già? Un film già visto no. Una serie sì solo
 * se il progresso del CSV è più avanti di quello in libreria.
 *
 * Voto e stato `watched` **non** bloccano più l'aggiornamento: bloccandoli, una
 * serie finita (o votata) non riceveva mai le stagioni nuove e l'import
 * "riconosceva ma non importava" (import del 2026-09-06: 678 righe, 0 scritte).
 * Il voto resta comunque quello dell'utente (`coalesce` nella RPC). Unica
 * eccezione: una serie segnata finita a mano non ha numero di stagione, quindi
 * non è confrontabile e non si tocca.
 */
function hasNewProgress(existing: ExistingEntry, item: ConfirmItem): boolean {
  if (item.kind === "movie") return existing.status !== "watched";
  if (existing.status === "watched" && existing.season_number == null) return false;
  const currentSeason = existing.season_number ?? 0;
  const currentEpisode = existing.episode_number ?? 0;
  const season = item.season ?? 1;
  const episode = item.episode ?? 1;
  return season > currentSeason || (season === currentSeason && episode > currentEpisode);
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Una data che esiste davvero sul calendario, non solo scritta giusta.
 * `isoDate` dei parser (file, Letterboxd, TV Time) e' un regex di prefisso e
 * lascia passare "2024-02-31" o "2024-13-01"; qui diventerebbe
 * `${lastDate}T12:00:00Z`, e il cast a `timestamptz` alza "date/time field value
 * out of range" facendo cadere l'intera transazione da 25 righe. JS fa scivolare
 * il 31 febbraio al 2 marzo: se il giro di andata e ritorno torna diverso, quel
 * giorno non esiste.
 */
function isDataIso(value: string): boolean {
  if (!DATA_ISO.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Una voce confermata scritta da chiunque abbia una sessione: `confirmImport` è
 * un endpoint HTTP come tutte le Server Action, e questi campi finiscono dentro
 * una RPC che scrive su `watch_entries`. Un solo valore fuori dai vincoli della
 * tabella (`rating between 1 and 10`) fa alzare la transazione, e con lei cade
 * tutto il blocco: la riga sbagliata si scarta e si conta fra le saltate.
 */
function isConfirmItem(raw: unknown): raw is ConfirmItem {
  if (typeof raw !== "object" || raw === null) return false;
  const item = raw as Record<string, unknown>;
  if (!isTmdbId(item.tmdbId)) return false;
  if (!isMediaType(item.kind)) return false;
  if (item.status !== "watched" && item.status !== "want" && item.status !== "watching")
    return false;
  if (item.rating != null && !isIntInRange(item.rating, 1, 10)) return false;
  if (item.season != null && !isIntInRange(item.season, 0, 1000)) return false;
  if (item.episode != null && !isIntInRange(item.episode, 0, 100_000)) return false;
  // diventa `${lastDate}T12:00:00Z`: se non è un giorno vero, il timestamp che
  // ne esce non è una data e la RPC fa cadere tutto il blocco
  if (item.lastDate != null && !isDataIso(String(item.lastDate))) return false;
  return true;
}

/** `Promise.all` con al massimo `limit` promesse in volo. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Scrive un blocco di entry confermate (max `CONFIRM_CHUNK_SIZE`), scartando le
 * righe che non superano `isConfirmItem` (contate fra le saltate). Non degrada
 * mai entrate esistenti: scrive solo dove il CSV è più avanti (`hasNewProgress`),
 * tenendo voto e `started_at`. Con `final` chiude l'import (riga `imports` +
 * revalidate).
 */
export async function confirmImport(
  items: ConfirmItem[],
  final: ConfirmFinal | null,
): Promise<ConfirmResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato", written: 0, skipped: 0 };

  if (!Array.isArray(items)) {
    return { ok: false, error: "Blocco non valido", written: 0, skipped: 0 };
  }
  if (items.length === 0 && !final) {
    return { ok: false, error: "Nessun titolo selezionato", written: 0, skipped: 0 };
  }
  if (items.length > CONFIRM_CHUNK_SIZE) {
    return { ok: false, error: "Blocco troppo grande", written: 0, skipped: 0 };
  }

  let written = 0;
  let skipped = 0;

  // una riga fuori dai vincoli della tabella farebbe fallire la transazione e
  // con lei tutto il blocco: si scarta qui e si conta come saltata
  const validi = items.filter(isConfirmItem);
  skipped += items.length - validi.length;

  if (validi.length > 0) {
    const { data: existingRows } = await supabase
      .from("watch_entries")
      .select(
        "title_id, media_type, status, rating, season_number, episode_number, started_at",
      )
      .eq("user_id", user.id)
      .in(
        "title_id",
        validi.map((i) => i.tmdbId),
      );
    const existingMap = new Map(
      (existingRows ?? []).map((e) => [`${e.media_type}:${e.title_id}`, e]),
    );

    // prepara le righe: cache titolo (FK + transizione watched), poi scrittura
    // in blocco via RPC `import_watch_entries` (transazione unica con
    // zapp.skip_activities=true: l'import non genera attività nel feed)
    interface RpcEntry {
      title_id: number;
      media_type: "movie" | "tv";
      status: "watched" | "watching" | "want";
      season_number: number | null;
      episode_number: number | null;
      started_at: string | null;
      finished_at: string | null;
      rating: number | null;
      /** Ultima visione dal CSV: ordina "Continua a guardare" e la libreria. */
      last_watched_at: string | null;
    }

    const toFetch: ConfirmItem[] = [];
    for (const item of validi) {
      const existing = existingMap.get(`${item.kind}:${item.tmdbId}`);
      // la watchlist non torna mai sopra a qualcosa che è già in libreria
      if (item.status === "want" && existing) {
        skipped++;
        continue;
      }
      if (item.status !== "want" && existing && !hasNewProgress(existing, item)) {
        skipped++;
        continue;
      }
      toFetch.push(item);
    }

    const cachedTitles = await mapWithConcurrency(toFetch, CONFIRM_CONCURRENCY, (item) =>
      getOrFetchTitle(item.tmdbId, item.kind),
    );

    const rpcEntries: RpcEntry[] = [];
    toFetch.forEach((item, i) => {
      const cached = cachedTitles[i];
      if (!cached) {
        skipped++;
        return;
      }
      const existing = existingMap.get(`${item.kind}:${item.tmdbId}`);
      const finishedDate = item.lastDate ? `${item.lastDate}T12:00:00Z` : null;

      if (item.status === "want") {
        rpcEntries.push({
          title_id: item.tmdbId,
          media_type: item.kind,
          status: "want",
          season_number: null,
          episode_number: null,
          started_at: null,
          finished_at: null,
          rating: item.rating,
          last_watched_at: null,
        });
        return;
      }

      if (item.kind === "movie") {
        // "watching" (export con colonna di avanzamento sotto l'85%, vedi
        // sources/export.ts): nessun `finished_at`, come per una serie non
        // ancora finita. `hasNewProgress` sopra ha gia' scartato il caso
        // pericoloso (un film gia' "watched" non arriva qui con "watching":
        // vedi il suo commento), e la RPC ha comunque il guard di sicurezza.
        const watching = item.status === "watching";
        rpcEntries.push({
          title_id: item.tmdbId,
          media_type: "movie",
          status: watching ? "watching" : "watched",
          season_number: null,
          episode_number: null,
          started_at: watching
            ? (existing?.started_at ?? finishedDate ?? new Date().toISOString())
            : null,
          finished_at: watching ? null : (finishedDate ?? new Date().toISOString()),
          rating: existing?.rating ?? item.rating,
          last_watched_at: finishedDate,
        });
        return;
      }

      const seasons = availableSeasons(cached.title.raw);
      const season = item.season ?? 1;
      const episode = item.episode ?? 1;
      const done = isLastEpisode(seasons, season, episode);
      rpcEntries.push({
        title_id: item.tmdbId,
        media_type: "tv",
        status: done ? "watched" : "watching",
        season_number: season,
        episode_number: episode,
        started_at: existing?.started_at ?? finishedDate ?? new Date().toISOString(),
        finished_at: done ? (finishedDate ?? new Date().toISOString()) : null,
        rating: existing?.rating ?? item.rating,
        last_watched_at: finishedDate,
      });
    });

    if (rpcEntries.length > 0) {
      const { data, error } = await supabase.rpc("import_watch_entries", {
        entries: rpcEntries as unknown as import("@/types/database").Json,
      });
      if (error) {
        return { ok: false, error: "Errore durante la scrittura.", written: 0, skipped };
      }
      written = data ?? 0;
      skipped += rpcEntries.length - written;
    }
  }

  if (final) {
    await lasciaPosto("import", user.id);

    const totalWritten = final.writtenBefore + written;

    await supabase.from("imports").insert({
      user_id: user.id,
      source: final.source,
      rows: final.totalRows,
      matched: totalWritten,
    });

    // Un export vero che ha scritto almeno un titolo chiude TUTTE le richieste
    // aperte dell'utente, non solo quella della piattaforma giusta: sembra un
    // errore e non lo è. Lo sniffer (`sources/export.ts`) non sa da quale
    // piattaforma venga il file — non glielo chiediamo, è una scelta di
    // progetto — quindi non c'è modo di chiudere solo quella giusta. Meglio un
    // promemoria in meno (per una piattaforma diversa da quella appena
    // importata) che un promemoria per una cosa già fatta. Non deve poter far
    // fallire l'import: entrambe le funzioni sotto già loggano ed
    // esauriscono i loro errori internamente, ma la chiamata resta comunque
    // isolata in un try/catch a prova di sorprese future.
    if (final.source === "export" && totalWritten > 0) {
      try {
        const aperte = await richiesteAperte(user.id);
        if (aperte.length > 0) {
          await chiudiRichieste(
            user.id,
            aperte.map((r) => r.platformKey),
          );
        }
      } catch (e) {
        console.error("[import] chiusura richieste fallita:", e);
      }
    }

    revalidatePath("/");
    revalidatePath("/library");
    revalidatePath("/profile");
  }

  return { ok: true, written, skipped };
}
