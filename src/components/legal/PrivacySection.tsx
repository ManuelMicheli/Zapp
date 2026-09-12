"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMirroredValue } from "@/lib/ui/optimistic";
import { concediConsenso, revocaConsenso } from "@/lib/legal/actions";
import { haConsenso, type RigaConsenso, type TipoConsenso } from "@/lib/legal/versions";

/**
 * "Privacy e dati": i consensi facoltativi, i documenti e — innestati da fuori —
 * i due bottoni sui dati (export e cancellazione).
 *
 * Gli interruttori scrivono **in `user_consents`**, non su una colonna a parte:
 * l'unica risposta alla domanda "a cosa ha acconsentito questa persona" deve
 * venire da un posto solo. `personalization_enabled` in `user_preferences` resta,
 * ma la action lo tiene allineato da sé (`allineaInterruttore`).
 */
export function PrivacySection({
  consensi,
  children,
}: {
  consensi: RigaConsenso[];
  children?: ReactNode;
}) {
  return (
    <section className="mt-9 flex flex-col gap-3.5 px-5 md:col-start-1 md:row-start-3 md:px-0">
      <h2 className="text-xl font-bold tracking-[-0.03em]">Privacy e dati</h2>
      <div className="flex flex-col rounded-[22px] border border-border bg-surface px-4">
        <ConsensoRow
          tipo="personalization"
          titolo="Personalizza i consigli"
          descrizione="Zapp usa quello che guardi e quello che salti per consigliarti meglio."
          spegnendo="Spegnendola cancelliamo i dati di navigazione già raccolti e la home torna uguale per tutti."
          attivo={haConsenso(consensi, "personalization")}
        />
        <div aria-hidden="true" className="h-px bg-border" />
        <ConsensoRow
          tipo="scrobble"
          titolo="Registra le visioni con ZConnection"
          descrizione="I dispositivi collegati segnano da soli quello che stai guardando."
          spegnendo="Spegnendola i dispositivi collegati smettono di aggiornare la libreria."
          attivo={haConsenso(consensi, "scrobble")}
        />
        <div aria-hidden="true" className="h-px bg-border" />
        {/* Un `<a>` e non un `fetch`: il file lo deve scaricare il browser, e con
          `Content-Disposition` ci pensa da solo. `download` non serve — l'header
          decide il nome — ma dice al browser che non deve navigare. */}
        <a
          href="/api/account/export"
          download
          className="flex items-center justify-between gap-4 py-4 transition-opacity active:opacity-60"
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold">Scarica i miei dati</span>
            <span className="text-xs leading-[1.45] text-muted">
              Un file JSON con tutto quello che Zapp ha su di te.
            </span>
          </span>
          <Freccia />
        </a>
        {children}
      </div>

      <p className="px-1 text-[12px] leading-relaxed text-muted-2">
        <DocLink href="/privacy">Informativa privacy</DocLink> ·{" "}
        <DocLink href="/termini">Condizioni d&apos;uso</DocLink> ·{" "}
        <DocLink href="/licenze">Licenze e fonti</DocLink>
      </p>
    </section>
  );
}

/** La freccia delle righe che portano altrove: stessa delle impostazioni. */
function Freccia() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-muted-2"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function DocLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} prefetch={false} className="text-accent-soft">
      {children}
    </Link>
  );
}

/**
 * Un consenso facoltativo. Stessa forma degli interruttori delle impostazioni:
 * qui l'utente si aspetta cose che si somigliano, non due UI diverse.
 */
function ConsensoRow({
  tipo,
  titolo,
  descrizione,
  spegnendo,
  attivo,
}: {
  tipo: Exclude<TipoConsenso, "terms" | "privacy">;
  titolo: string;
  descrizione: string;
  spegnendo: string;
  attivo: boolean;
}) {
  const { value: acceso, pending, run } = useMirroredValue(attivo);

  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-4">
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{titolo}</span>
        <span className="text-xs leading-[1.45] text-muted">{descrizione}</span>
        <span className="mt-0.5 text-xs leading-[1.45] text-muted-2">{spegnendo}</span>
      </span>
      <input
        type="checkbox"
        checked={acceso}
        disabled={pending}
        onChange={() => {
          const next = !acceso;
          run(next, () => (next ? concediConsenso(tipo) : revocaConsenso(tipo)));
        }}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg ${
          acceso ? "bg-accent" : "bg-white/[0.14]"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 size-[26px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.4)] transition-transform ${
            acceso ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </label>
  );
}
