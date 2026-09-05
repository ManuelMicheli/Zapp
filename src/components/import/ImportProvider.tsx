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
  type ConfirmItem,
} from "@/app/(app)/import/netflix/actions";
import { CONFIRM_CHUNK_SIZE } from "@/app/(app)/import/netflix/limits";

/** Stato dell'import in corso (o appena finito), visibile da tutta l'app. */
export interface ImportJob {
  /** Titoli scritti o saltati finora. */
  done: number;
  total: number;
  written: number;
  skipped: number;
  error: string | null;
  finished: boolean;
}

interface ImportContextValue {
  job: ImportJob | null;
  /**
   * Avvia la scrittura a blocchi e torna subito: il loop vive nel provider (montato
   * nel layout), quindi continua anche navigando fra le pagine.
   */
  startImport: (items: ConfirmItem[], totalRows: number) => void;
  dismiss: () => void;
}

const ImportContext = createContext<ImportContextValue | null>(null);

export function useImport() {
  const ctx = useContext(ImportContext);
  if (!ctx) throw new Error("useImport fuori da <ImportProvider>");
  return ctx;
}

const NETWORK_ERROR = "Connessione interrotta. L'import si è fermato.";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Import Netflix in background: tiene il loop dei blocchi (`confirmNetflixImport`)
 * fuori dalla pagina di import, così l'utente torna in home e segue l'avanzamento
 * dal chip sopra la nav. Vale finché l'app resta aperta: i blocchi già scritti
 * restano (l'import non degrada mai entry esistenti, ripeterlo è sicuro).
 */
export function ImportProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { show } = useToast();
  const [job, setJob] = useState<ImportJob | null>(null);
  const runningRef = useRef(false);

  const startImport = useCallback(
    (items: ConfirmItem[], totalRows: number) => {
      if (runningRef.current || items.length === 0) return;
      runningRef.current = true;
      setJob({
        done: 0,
        total: items.length,
        written: 0,
        skipped: 0,
        error: null,
        finished: false,
      });

      void (async () => {
        const parts = chunk(items, CONFIRM_CHUNK_SIZE);
        let written = 0;
        let skipped = 0;
        let error: string | null = null;
        try {
          for (let i = 0; i < parts.length; i++) {
            const isLast = i === parts.length - 1;
            const res = await confirmNetflixImport(
              parts[i],
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
        } catch {
          error = NETWORK_ERROR;
        }
        runningRef.current = false;
        setJob((j) => (j ? { ...j, error, finished: true, written, skipped } : j));
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
