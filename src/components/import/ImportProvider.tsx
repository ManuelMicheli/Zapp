"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useToast } from "@/components/ui/Toaster";
import {
  confirmImport,
  matchImportCandidates,
  type ConfirmItem,
} from "@/app/(app)/import/actions";
import {
  CONFIRM_CHUNK_SIZE,
  MATCH_CHUNK_SIZE,
  MATCH_CONCURRENCY,
} from "@/app/(app)/import/limits";
import type { ImportCandidate } from "@/lib/import/candidate";
import { mergeProposals, type ImportProposal } from "@/lib/import/candidate";
import type { SourceSlug } from "@/lib/import/sources/registry";

/** Fase in corso: prima si riconoscono i titoli su TMDB, poi si scrivono. */
export type ImportPhase = "match" | "write";

/** Stato dell'import in corso (o appena finito), visibile da tutta l'app. */
export interface ImportJob {
  phase: ImportPhase;
  /** Candidati riconosciuti (fase match) o titoli scritti/saltati (fase write). */
  done: number;
  total: number;
  written: number;
  skipped: number;
  /** Righe del CSV di cui TMDB non ha trovato il titolo. */
  unmatched: number;
  error: string | null;
  finished: boolean;
}

interface ImportContextValue {
  job: ImportJob | null;
  /**
   * Avvia riconoscimento + scrittura a blocchi e torna subito: il loop vive nel
   * provider (montato nel layout), quindi continua navigando fra le pagine.
   */
  startImport: (
    candidates: ImportCandidate[],
    totalRows: number,
    source: SourceSlug,
  ) => void;
  dismiss: () => void;
}

const ImportContext = createContext<ImportContextValue | null>(null);

export function useImport() {
  const ctx = useContext(ImportContext);
  if (!ctx) throw new Error("useImport fuori da <ImportProvider>");
  return ctx;
}

const NETWORK_ERROR = "Connessione interrotta. L'import si è fermato.";
const NO_MATCH_ERROR = "Nessun titolo riconosciuto.";
/** Non più di un `router.refresh()` a blocco ogni tot millisecondi. */
const REFRESH_EVERY_MS = 2000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Esegue `fn` su ogni elemento con al massimo `limit` chiamate in volo,
 * mantenendo l'ordine dei risultati. Si ferma al primo errore.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onDone: (result: R, index: number) => void,
): Promise<void> {
  let next = 0;
  let failed: unknown = null;
  async function worker() {
    for (;;) {
      if (failed) return;
      const i = next++;
      if (i >= items.length) return;
      try {
        onDone(await fn(items[i], i), i);
      } catch (e) {
        failed = e;
        return;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failed) throw failed;
}

/**
 * Import Netflix in background: dopo il parsing del CSV la pagina consegna qui i
 * candidati e torna in home. Il provider riconosce i titoli su TMDB a blocchi
 * paralleli e, appena finito, **avvia da solo la scrittura**: l'utente segue le
 * due fasi dal chip sopra la nav senza schermate intermedie. Vale finché l'app
 * resta aperta: i blocchi già scritti restano (l'import non degrada mai entry
 * esistenti, ripeterlo è sicuro).
 */
export function ImportProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { show } = useToast();
  const [job, setJob] = useState<ImportJob | null>(null);
  const runningRef = useRef(false);
  /** Ultimo `router.refresh()` durante l'import: le liste si aggiornano a blocchi. */
  const lastRefreshRef = useRef(0);
  const refreshingRef = useRef(false);

  const refreshLists = useCallback(() => {
    const now = Date.now();
    if (refreshingRef.current || now - lastRefreshRef.current < REFRESH_EVERY_MS) return;
    refreshingRef.current = true;
    lastRefreshRef.current = now;
    startTransition(() => {
      // il refresh è solo sincronizzazione: se fallisce, l'import va avanti lo stesso e
      // l'utente non deve vedere un errore di importazione
      try {
        router.refresh();
      } catch {
        // niente: le liste si aggiorneranno col refresh finale
      } finally {
        refreshingRef.current = false;
      }
    });
  }, [router]);

  const startImport = useCallback(
    (candidates: ImportCandidate[], totalRows: number, source: SourceSlug) => {
      if (runningRef.current || candidates.length === 0) return;
      runningRef.current = true;

      // chi porta già l'id TMDB salta il riconoscimento: nessuna chiamata, nessun
      // giro di rete. Un export TV Time da migliaia di righe parte dalla scrittura.
      const daRiconoscere = candidates.filter((c) => c.tmdbId == null);
      const giaNoti: ImportProposal[] = candidates
        .filter((c) => c.tmdbId != null)
        .map((c) => ({
          ...c,
          tmdbId: c.tmdbId ?? null,
          matchedTitle: c.netflixTitle,
          posterPath: null,
          year: c.year ?? null,
          exact: true,
          viaFallback: false,
        }));

      setJob({
        phase: "match",
        done: giaNoti.length,
        total: candidates.length,
        written: 0,
        skipped: 0,
        unmatched: 0,
        error: null,
        finished: false,
      });

      void (async () => {
        let written = 0;
        let skipped = 0;
        let unmatched = 0;
        let error: string | null = null;

        try {
          // ---- fase 1: riconoscimento su TMDB, blocchi in parallelo ----
          const parts = chunk(daRiconoscere, MATCH_CHUNK_SIZE);
          const byPart: ImportProposal[][] = new Array(parts.length);
          let matchedRows = giaNoti.length;
          await mapWithConcurrency(
            parts,
            MATCH_CONCURRENCY,
            (part) => matchImportCandidates(part),
            (res, i) => {
              if (!res.ok) throw new Error(res.error ?? "Errore");
              byPart[i] = res.proposals;
              matchedRows += parts[i].length;
              setJob((j) => (j ? { ...j, done: matchedRows } : j));
            },
          );

          // stesso titolo TMDB da più righe (film scritti in due modi, episodi a
          // ripiego): una sola proposta
          const proposals = mergeProposals([...giaNoti, ...byPart.flat()]);
          const items: ConfirmItem[] = [];
          for (const p of proposals) {
            if (p.tmdbId == null) {
              unmatched++;
              continue;
            }
            items.push({
              tmdbId: p.tmdbId,
              kind: p.kind,
              season: p.season,
              episode: p.episode,
              lastDate: p.lastDate,
              rating: p.rating ?? null,
              status: p.status ?? "watched",
            });
          }

          if (items.length === 0) {
            error = NO_MATCH_ERROR;
          } else {
            // ---- fase 2: scrittura, subito e senza conferma ----
            setJob((j) =>
              j ? { ...j, phase: "write", done: 0, total: items.length, unmatched } : j,
            );
            const writeParts = chunk(items, CONFIRM_CHUNK_SIZE);
            for (let i = 0; i < writeParts.length; i++) {
              const isLast = i === writeParts.length - 1;
              const res = await confirmImport(
                writeParts[i],
                isLast ? { totalRows, writtenBefore: written, source } : null,
              );
              if (!res.ok) {
                error = res.error ?? "Errore";
                break;
              }
              written += res.written;
              skipped += res.skipped;
              const done = Math.min(items.length, (i + 1) * CONFIRM_CHUNK_SIZE);
              setJob((j) => (j ? { ...j, done, written, skipped } : j));
              // la libreria e la home si riempiono mentre l'import va avanti
              refreshLists();
            }
          }
        } catch (e) {
          // l'errore di un blocco arriva qui come Error con il suo messaggio;
          // una fetch caduta no
          error = e instanceof Error && e.message ? e.message : NETWORK_ERROR;
        }

        runningRef.current = false;
        setJob((j) =>
          j ? { ...j, error, finished: true, written, skipped, unmatched } : j,
        );
        if (error) {
          show(error);
        } else {
          show(`${written} titoli importati`);
          // le liste (home, libreria, profilo) sono già state invalidate dal server:
          // il refresh le fa arrivare senza aspettare una navigazione. Azzera la
          // guardia del throttle: altrimenti un import successivo (il provider resta
          // montato finché l'app è aperta) erediterebbe lo stato di questo.
          lastRefreshRef.current = 0;
          router.refresh();
        }
      })();
    },
    [router, show, refreshLists],
  );

  const dismiss = useCallback(() => {
    setJob((j) => (j?.finished ? null : j));
  }, []);

  const value = useMemo(
    () => ({ job, startImport, dismiss }),
    [job, startImport, dismiss],
  );

  return <ImportContext.Provider value={value}>{children}</ImportContext.Provider>;
}
