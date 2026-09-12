"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { useImport } from "@/components/import/ImportProvider";
import type { SourceMeta } from "@/lib/import/sources/registry";
import { parseImportFiles } from "../actions";

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
 * Caricamento dei file: unica cosa che resta in pagina. Il parsing è una chiamata
 * breve; poi i candidati passano a `ImportProvider` (layout), che riconosce i
 * titoli e scrive **senza schermata di conferma**, e l'utente torna in home dove
 * il chip sopra la nav mostra le due fasi.
 */
export function ImportClient({ source }: { source: SourceMeta }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { startImport } = useImport();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Estensioni accettate da questa sorgente, per il controllo prima dell'invio. */
  const estensioni = source.accetta
    .split(",")
    .filter((a) => a.startsWith("."))
    .map((a) => a.toLowerCase());

  function handleFiles(files: File[]) {
    setError(null);
    const buoni = files.filter((f) =>
      estensioni.some((ext) => f.name.toLowerCase().endsWith(ext)),
    );
    if (buoni.length === 0) {
      setError(`Questa pagina accetta ${estensioni.join(" o ")}`);
      return;
    }
    const formData = new FormData();
    formData.set("source", source.slug);
    for (const file of buoni) formData.append("file", file);
    startTransition(async () => {
      try {
        const res = await parseImportFiles(formData);
        if (!res.ok) {
          setError(res.error ?? "Errore");
          return;
        }
        startImport(res.candidates, res.totalRows, source.slug);
        router.push("/");
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3.5 pb-1.5">
        <div
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl text-3xl font-extrabold text-white"
          style={{ background: source.colore }}
        >
          {source.sigla}
        </div>
        <p className="text-pretty text-[15px] leading-[1.45] text-white/80">
          Porta in Zapp tutto quello che hai già visto. Ci vuole un minuto.
        </p>
      </div>

      <div className="space-y-3.5 rounded-[20px] border border-border bg-surface p-[18px]">
        <p className="text-[15px] font-semibold">Come scaricare il tuo storico</p>
        {source.istruzioni.map((testo, i) => (
          <InstructionStep key={testo} n={i + 1}>
            {testo}
          </InstructionStep>
        ))}
        <p className="text-xs leading-relaxed text-muted">
          Il file viene elaborato in memoria e scartato: non salviamo né il file né
          l&apos;elenco dei titoli non importati.
        </p>
        {source.esempio && (
          <a
            href={source.esempio}
            download
            className="inline-block text-xs font-medium text-accent-pale underline underline-offset-2"
          >
            Scarica un file di esempio
          </a>
        )}
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
          handleFiles([...e.dataTransfer.files]);
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
        accept={source.accetta}
        multiple={source.multiplo}
        hidden
        disabled={pending}
        onChange={(e) => {
          const files = e.target.files ? [...e.target.files] : [];
          if (files.length > 0) handleFiles(files);
        }}
      />
      <Button
        type="button"
        className="w-full"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? "Analisi in corso…" : source.bottone}
      </Button>
      <p className="text-center text-xs leading-relaxed text-muted">
        Riconoscimento e import vanno avanti in secondo piano: puoi usare l&apos;app,
        l&apos;avanzamento è nel banner sopra la barra.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
