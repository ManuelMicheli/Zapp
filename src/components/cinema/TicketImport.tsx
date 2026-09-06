"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useToast } from "@/components/ui/Toaster";
import { attachTicket } from "@/lib/cinema/tickets";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "./icons";

const MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

type Phase = "idle" | "upload" | "decode" | "save";

const LABEL: Record<Phase, string> = {
  idle: "Aggiungi il biglietto",
  upload: "Carico il file…",
  decode: "Leggo il QR…",
  save: "Salvo…",
};

/**
 * "Aggiungi il biglietto": screenshot, foto o PDF del biglietto comprato. Carica
 * l'originale nel bucket privato `tickets` (cartella dell'utente), legge i QR nel
 * browser e li salva sul piano. Senza QR leggibili resta l'immagine originale.
 */
export function TicketImport({
  planId,
  userId,
  compact = false,
  onDone,
}: {
  planId: string;
  /** Cartella del bucket; se assente si legge dalla sessione del browser. */
  userId?: string;
  /** Bottone piccolo (tagliando in home) invece della pillola grande. */
  compact?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { show } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const busy = phase !== "idle";

  async function handle(file: File) {
    if (file.size > MAX_BYTES) {
      show("Il file supera i 10 MB");
      return;
    }
    const ext = EXT[file.type] ?? (/\.pdf$/i.test(file.name) ? "pdf" : null);
    if (!ext) {
      show("Usa un'immagine (JPG, PNG, WebP) o un PDF");
      return;
    }
    try {
      setPhase("upload");
      const supabase = createClient();
      const uid = userId ?? (await supabase.auth.getUser()).data.user?.id;
      if (!uid) throw new Error("no-user");
      const path = `${uid}/${planId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("tickets").upload(path, file, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });
      if (error) throw error;

      setPhase("decode");
      let codes: string[] = [];
      try {
        const { decodeTicket } = await import("@/lib/qr/decode");
        codes = (await decodeTicket(file)).codes;
      } catch {
        codes = [];
      }

      setPhase("save");
      const r = await attachTicket(planId, { codes, path });
      if (!r.ok) {
        await supabase.storage.from("tickets").remove([path]);
        show(r.error ?? "Errore");
        return;
      }
      show(
        codes.length > 0
          ? codes.length > 1
            ? `${codes.length} biglietti aggiunti`
            : "Biglietto aggiunto"
          : "QR non riconosciuto: mostro l'immagine del biglietto",
      );
      onDone?.();
      router.refresh();
    } catch {
      show("Caricamento non riuscito, riprova");
    } finally {
      setPhase("idle");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handle(f);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className={
          compact
            ? "inline-flex h-10 items-center gap-2 rounded-full border border-dashed border-white/25 px-4 text-[14px] font-semibold text-text hover:bg-white/[0.06] disabled:opacity-60"
            : "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-dashed border-white/25 px-5 text-[15px] font-semibold text-text hover:bg-white/[0.06] disabled:opacity-60"
        }
      >
        <Icon name={busy ? "clock" : "qr"} size={16} />
        {LABEL[phase]}
      </button>
    </>
  );
}
