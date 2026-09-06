"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { useImport } from "@/components/import/ImportProvider";
import { parseNetflixCsv } from "./actions";
import { CSV_INVALID_MESSAGE } from "./messages";

const NETWORK_ERROR = "Connessione interrotta. Controlla la rete e riprova.";

/** Riga numerata delle istruzioni di download. */
function InstructionStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/[0.18] text-xs font-bold text-accent-pale">
        {n}
      </span>
      <p className="pt-0.5 text-sm leading-[1.45] text-white/80">{children}</p>
    </div>
  );
}

/**
 * Caricamento del CSV: unica cosa che resta in pagina. Il parsing è una chiamata
 * breve; poi i candidati passano a `ImportProvider` (layout), che riconosce i
 * titoli e scrive **senza schermata di conferma**, e l'utente torna in home dove
 * il chip sopra la nav mostra le due fasi.
 */
export function ImportClient() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { startImport } = useImport();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      try {
        const res = await parseNetflixCsv(formData);
        if (!res.ok) {
          setError(res.error ?? "Errore");
          return;
        }
        startImport(res.candidates, res.totalRows);
        router.push("/");
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3.5 pb-1.5">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#E50914] text-3xl font-extrabold text-white shadow-[0_12px_30px_rgba(229,9,20,0.35)]">
          N
        </div>
        <p className="text-pretty text-[15px] leading-[1.45] text-white/80">
          Porta in Zapp tutto quello che hai già visto. Ci vuole un minuto.
        </p>
      </div>

      <div className="space-y-3.5 rounded-[20px] border border-border bg-surface p-[18px]">
        <p className="text-[15px] font-semibold">Come scaricare il tuo storico</p>
        <InstructionStep n={1}>
          Netflix → <b className="font-semibold text-white">Account</b> →{" "}
          <b className="font-semibold text-white">Profilo</b> →{" "}
          <b className="font-semibold text-white">Attività di visione</b>
        </InstructionStep>
        <InstructionStep n={2}>
          In fondo, <b className="font-semibold text-white">&quot;Scarica tutto&quot;</b>
        </InstructionStep>
        <InstructionStep n={3}>
          Carica qui il file{" "}
          <span className="text-accent-pale">NetflixViewingHistory.csv</span>
        </InstructionStep>
        <p className="text-xs leading-relaxed text-muted">
          Il file viene elaborato in memoria e scartato: non salviamo né il CSV né
          l&apos;elenco dei titoli non importati.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (!f) return;
          // solo .csv: un file di altro tipo mostra l'errore senza chiamare il parser
          if (!f.name.toLowerCase().endsWith(".csv")) {
            setError(CSV_INVALID_MESSAGE);
            return;
          }
          handleFile(f);
        }}
        className={`flex flex-col items-center gap-2.5 rounded-[22px] border-[1.5px] border-dashed px-5 py-7 ${
          dragging
            ? "border-accent bg-accent/[0.12]"
            : "border-accent/50 bg-accent/[0.06]"
        }`}
      >
        <div className="flex size-[52px] items-center justify-center rounded-[14px] bg-accent/[0.18]">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent-pale"
            aria-hidden="true"
          >
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5" />
            <path d="M12 18v-6M9 15l3-3 3 3" />
          </svg>
        </div>
        <p className="text-[15px] font-semibold">Trascina qui il CSV</p>
        <p className="text-xs text-muted">max 5MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        disabled={pending}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <Button
        type="button"
        className="w-full"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? "Analisi in corso…" : "Scegli il file CSV"}
      </Button>
      <p className="text-center text-xs leading-relaxed text-muted">
        Riconoscimento e import vanno avanti in secondo piano: puoi usare l&apos;app,
        l&apos;avanzamento è nel banner sopra la barra.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
