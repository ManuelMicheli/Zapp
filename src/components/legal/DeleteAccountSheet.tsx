"use client";

import { useState, useTransition } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { deleteAccount } from "@/lib/account/actions";
import { postToNative } from "@/lib/native/bridge";

const SPARISCE = [
  "la libreria e i voti",
  "recensioni, commenti e risposte",
  "amicizie e consigli scambiati",
  "le liste che hai creato",
  "i biglietti del cinema caricati",
  "i dispositivi collegati a ZConnection",
];

/**
 * Conferma della cancellazione (art. 17 GDPR).
 *
 * Si digita il proprio nome utente: un "sei sicuro?" si clicca per riflesso,
 * questo no. Il riepilogo di cosa sparisce sta **prima** del campo, e il link
 * all'export sta accanto: chi arriva qui per portarsi via i dati non deve
 * scoprire dopo che poteva scaricarli.
 */
export function DeleteAccountSheet({ username }: { username: string }) {
  const [aperto, setAperto] = useState(false);
  const [conferma, setConferma] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const corrisponde = conferma.trim().toLowerCase() === username.toLowerCase();

  const elimina = () => {
    setErrore(null);
    const formData = new FormData();
    formData.set("conferma", conferma);
    startTransition(async () => {
      // Cancellare l'account è anche un'uscita: il guscio nativo deve
      // dimenticare il token del dispositivo (fuori dal guscio non fa nulla).
      postToNative({ type: "signedOut" });
      // Andata a buon fine, la action fa `redirect("/addio")` e non torna mai
      // qui: l'unico risultato che si vede è un errore.
      const esito = await deleteAccount(formData);
      setErrore(esito.error ?? "Non è stato possibile eliminare l'account. Riprova.");
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAperto(true)}
        className="flex items-center justify-between gap-4 py-4 text-left transition-opacity active:opacity-60"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-danger">
            Elimina l&apos;account
          </span>
          <span className="text-xs leading-[1.45] text-muted">
            Cancella per sempre te e tutto quello che hai salvato.
          </span>
        </span>
      </button>

      <Sheet
        open={aperto}
        onClose={() => setAperto(false)}
        title="Elimina l'account"
        size="tall"
      >
        <div className="flex flex-col gap-4 px-1 pb-2">
          <p className="text-[14px] leading-relaxed text-muted">
            L&apos;eliminazione è definitiva e immediata. Spariscono:
          </p>
          <ul className="flex flex-col gap-1.5 text-[14px] leading-relaxed text-muted">
            {SPARISCE.map((voce) => (
              <li key={voce} className="flex gap-2">
                <span aria-hidden="true" className="text-muted-2">
                  •
                </span>
                {voce}
              </li>
            ))}
          </ul>

          <p className="rounded-[14px] bg-surface-2 p-4 text-[13px] leading-relaxed text-muted">
            Prima di continuare puoi{" "}
            <a href="/api/account/export" download className="text-accent-soft underline">
              scaricare i tuoi dati
            </a>
            . Dopo non sarà più possibile.
          </p>

          <label className="flex flex-col gap-2">
            <span className="text-[13px] text-muted">
              Per confermare scrivi il tuo nome utente:{" "}
              <strong className="text-text">{username}</strong>
            </span>
            <input
              value={conferma}
              onChange={(e) => setConferma(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              aria-label="Nome utente di conferma"
              className="h-[54px] w-full rounded-[14px] border border-transparent bg-surface-2 px-[18px] text-base text-text outline-none placeholder:text-muted focus:border-danger focus:ring-4 focus:ring-danger/15"
            />
          </label>

          {errore && <p className="text-[13px] text-danger">{errore}</p>}

          <Button
            variant="danger"
            disabled={!corrisponde || pending}
            onClick={elimina}
            className="w-full"
          >
            {pending ? "Eliminazione…" : "Elimina definitivamente"}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
