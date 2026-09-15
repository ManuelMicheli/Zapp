"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { useImport } from "@/components/import/ImportProvider";
import { SourceMark } from "@/components/import/SourceMark";
import { createClient } from "@/lib/supabase/client";
import type { SourceMeta } from "@/lib/import/sources/registry";
import { parseImportFiles, parseImportFromStorage } from "../actions";
import {
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  MAX_STORAGE_BYTES,
  MAX_STORAGE_LABEL,
  MAX_UPLOAD_FILES,
} from "../limits";

const NETWORK_ERROR = "Connessione interrotta. Controlla la rete e riprova.";
const UPLOAD_ERROR = "Caricamento non riuscito, riprova.";

/**
 * Content-Type per estensione invece di fidarsi di `file.type`: il browser non
 * riconosce .tsv (arriva vuoto) e su .zip cambia da un sistema all'altro
 * ("application/zip" o "application/x-zip-compressed"). Il bucket accetta
 * mime precisi (migration 0059): un tipo sbagliato fa fallire l'upload con un
 * errore che non spiega niente all'utente.
 */
const CONTENT_TYPE: Record<string, string> = {
  ".zip": "application/zip",
  ".csv": "text/csv",
  ".json": "application/json",
  ".tsv": "text/tab-separated-values",
};

function contentTypeFor(name: string): string {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPE[ext] ?? "application/octet-stream";
}

/**
 * Articolo italiano corretto per ogni estensione: "lo" davanti a Z (ZIP), "il"
 * per le altre. Se un giorno arriva un'estensione non elencata qui, ripiega
 * sull'estensione nuda in maiuscolo con "il", che resta leggibile anche se non
 * perfettamente elegante.
 */
const ETICHETTA_ESTENSIONE: Record<string, string> = {
  ".csv": "il CSV",
  ".zip": "lo ZIP",
  ".json": "il JSON",
};

/** "il CSV" · "il CSV o lo ZIP" · "il JSON, il CSV o lo ZIP": mai l'ultima virgola prima di "o". */
function elencoFormati(estensioni: string[]): string {
  const etichette = estensioni.map(
    (ext) => ETICHETTA_ESTENSIONE[ext] ?? `il ${ext.slice(1).toUpperCase()}`,
  );
  if (etichette.length <= 1) return etichette[0] ?? "";
  return `${etichette.slice(0, -1).join(", ")} o ${etichette[etichette.length - 1]}`;
}

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

  // "export" non passa dal corpo della Server Action: il file sale dal
  // browser direttamente nel bucket `import-uploads` (fino a 100 MB), la
  // action riceve solo il percorso. Le altre sorgenti restano sul vecchio
  // percorso a corpo (tetto 5 MB), che va benissimo per un csv o quattro.
  const isStorage = source.slug === "export";
  const maxBytes = isStorage ? MAX_STORAGE_BYTES : MAX_FILE_BYTES;
  const maxLabel = isStorage ? MAX_STORAGE_LABEL : MAX_FILE_LABEL;

  /** Caricamento su Storage in corso (solo sorgente "export"), 0-100. */
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  /**
   * Cosa il parser ha ignorato, solo quando non ha trovato niente da
   * importare (spiega l'errore). Quando invece l'import parte, gli avvisi
   * viaggiano con `startImport` e si vedono alla fine nel chip: un bottone in
   * più qui, su un import che deve restare senza attrito, farebbe solo
   * abbandonare.
   */
  const [avvisi, setAvvisi] = useState<string[] | null>(null);

  /** Estensioni accettate da questa sorgente, per il controllo prima dell'invio. */
  const estensioni = source.accetta
    .split(",")
    .filter((a) => a.startsWith("."))
    .map((a) => a.toLowerCase());

  /** Carica ogni file nel bucket dell'utente, poi chiede alla action di leggerli. */
  async function handleStorageFiles(files: File[]) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Non autenticato");
      return;
    }

    const paths: string[] = [];
    setUploadPct(0);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = `${user.id}/${crypto.randomUUID()}/${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("import-uploads")
          .upload(path, file, { contentType: contentTypeFor(file.name), upsert: false });
        if (uploadError) throw uploadError;
        paths.push(path);
        setUploadPct(Math.round(((i + 1) / files.length) * 100));
      }
    } catch {
      setUploadPct(null);
      // quello che e' gia' salito non deve restare: e' cronologia personale
      if (paths.length > 0) void supabase.storage.from("import-uploads").remove(paths);
      setError(UPLOAD_ERROR);
      return;
    }
    setUploadPct(null);

    startTransition(async () => {
      try {
        const res = await parseImportFromStorage(paths, source.slug);
        if (!res.ok) {
          setAvvisi(res.avvisi && res.avvisi.length > 0 ? res.avvisi : null);
          setError(res.error ?? "Errore");
          return;
        }
        // l'import parte subito, senza fermarsi: gli avvisi arrivano al chip
        // insieme all'esito finale (ImportProvider/ImportChip)
        startImport(res.candidates, res.totalRows, source.slug, res.avvisi);
        router.push("/");
      } catch {
        // il file resta caricato: non l'ha letto nessuno, quindi non l'ha
        // ancora cancellato nessuno. Se la sessione riprova con un file
        // diverso resta orfano nel bucket fino al giro di pulizia che parte
        // all'inizio del prossimo import (`spazzaCaricatiVecchi`).
        setError(NETWORK_ERROR);
      }
    });
  }

  function handleFiles(files: File[]) {
    setError(null);
    setAvvisi(null);
    const buoni = files.filter((f) =>
      estensioni.some((ext) => f.name.toLowerCase().endsWith(ext)),
    );
    if (buoni.length === 0) {
      setError(`Questa pagina accetta ${elencoFormati(estensioni)}`);
      return;
    }
    // prima di caricare, non dopo: la action rifiuta lo stesso, ma senza questo
    // controllo chi sceglie nove file li spediva tutti (fino a 100 MB l'uno)
    // per sentirsi dire alla fine che sono troppi
    if (buoni.length > MAX_UPLOAD_FILES) {
      setError(`Massimo ${MAX_UPLOAD_FILES} file per volta: caricane meno.`);
      return;
    }
    if (isStorage) {
      // qui il tetto e' per file, non sulla somma: ognuno e' un oggetto a se'
      // nel bucket (`file_size_limit` della migration 0059)
      const troppoGrande = buoni.find((f) => f.size > maxBytes);
      if (troppoGrande) {
        setError(`${troppoGrande.name} supera ${maxLabel}.`);
        return;
      }
      void handleStorageFiles(buoni);
      return;
    }
    // il corpo di una Server Action ha un tetto: senza questo controllo un file
    // troppo grande si presentava come un errore di rete
    if (buoni.reduce((somma, f) => somma + f.size, 0) > maxBytes) {
      setError(
        buoni.length > 1
          ? `I file superano ${maxLabel} in tutto: caricane meno per volta.`
          : `Il file supera ${maxLabel}.`,
      );
      return;
    }
    const formData = new FormData();
    formData.set("source", source.slug);
    for (const file of buoni) formData.append("file", file);
    startTransition(async () => {
      try {
        const res = await parseImportFiles(formData);
        if (!res.ok) {
          setAvvisi(res.avvisi && res.avvisi.length > 0 ? res.avvisi : null);
          setError(res.error ?? "Errore");
          return;
        }
        startImport(res.candidates, res.totalRows, source.slug, res.avvisi);
        router.push("/");
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3.5 pb-1.5">
        <SourceMark slug={source.slug} size={56} className="rounded-2xl" />
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
          {isStorage
            ? "Il file sale nel tuo spazio privato e viene cancellato appena letto: non resta nel bucket né salviamo l'elenco dei titoli non importati."
            : "Il file viene elaborato in memoria e scartato: non salviamo né il file né l'elenco dei titoli non importati."}
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
        <p className="text-[15px] font-semibold">
          Trascina qui {elencoFormati(estensioni)}
        </p>
        <p className="text-xs text-muted">max {maxLabel}</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={source.accetta}
        multiple={source.multiplo}
        hidden
        disabled={pending || uploadPct != null}
        onChange={(e) => {
          const files = e.target.files ? [...e.target.files] : [];
          if (files.length > 0) handleFiles(files);
        }}
      />
      {avvisi && (
        <ul className="space-y-1 text-xs leading-relaxed text-muted">
          {avvisi.map((testo) => (
            <li key={testo}>{testo}</li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        className="w-full"
        disabled={pending || uploadPct != null}
        onClick={() => inputRef.current?.click()}
      >
        {uploadPct != null
          ? `Carico il file… ${uploadPct}%`
          : pending
            ? "Analisi in corso…"
            : source.bottone}
      </Button>
      <p className="text-center text-xs leading-relaxed text-muted">
        Riconoscimento e import vanno avanti in secondo piano: puoi usare l&apos;app,
        l&apos;avanzamento è nel banner sopra la barra.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
