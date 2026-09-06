"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useToast } from "@/components/ui/Toaster";
import {
  confirmNetflixImport,
  matchNetflixCandidates,
  type ConfirmItem,
} from "@/app/(app)/import/netflix/actions";
import {
  CONFIRM_CHUNK_SIZE,
  MATCH_CHUNK_SIZE,
  MATCH_CONCURRENCY,
} from "@/app/(app)/import/netflix/limits";
import type { ImportCandidate } from "@/lib/import/netflix-rows";
import { mergeProposals, type ImportProposal } from "@/lib/import/netflix-proposals";

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
  startImport: (candidates: ImportCandidate[], totalRows: number) => void;
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

  const startImport = useCallback(
    (candidates: ImportCandidate[], totalRows: number) => {
      if (runningRef.current || candidates.length === 0) return;
      runningRef.current = true;
      setJob({
        phase: "match",
        done: 0,
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
          const parts = chunk(candidates, MATCH_CHUNK_SIZE);
          const byPart: ImportProposal[][] = new Array(parts.length);
          let matchedRows = 0;
          await mapWithConcurrency(
            parts,
            MATCH_CONCURRENCY,
            (part) => matchNetflixCandidates(part),
            (res, i) => {
              if (!res.ok) throw new Error(res.error ?? "Errore");
              byPart[i] = res.proposals;
              matchedRows += parts[i].length;
              setJob((j) => (j ? { ...j, done: matchedRows } : j));
            },
          );

          // stesso titolo TMDB da più righe (film scritti in due modi, episodi a
          // ripiego): una sola proposta
          const proposals = mergeProposals(byPart.flat());
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
              const res = await confirmNetflixImport(
                writeParts[i],
                isLast ? { totalRows, writtenBefore: written } : null,
              );
              if (!res.ok) {
                error = res.error ?? "Errore";
                break;
              }
              written += res.written;
              skipped += res.skipped;
              const done = Math.min(items.length, (i + 1) * CONFIRM_CHUNK_SIZE);
              setJob((j) => (j ? { ...j, done, written, skipped } : j));
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
          // il refresh le fa arrivare senza aspettare una navigazione
          router.refresh();
        }
      })();
    },
    [router, show],
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
