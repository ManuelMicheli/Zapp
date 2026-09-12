"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/Sheet";
import { deleteList, updateList } from "@/lib/lists/actions";
import type { ListDefaultRole } from "@/lib/lists/queries";

/**
 * Nome, descrizione, permesso predefinito e cancellazione: le uniche cose che
 * un proprietario poteva decidere **una volta sola**, alla creazione. Le policy
 * di UPDATE e DELETE su `title_lists` esistevano gia', ma non c'era nessuna
 * azione che le usasse, quindi una lista nata con il nome sbagliato restava
 * cosi' per sempre.
 *
 * La cancellazione chiede conferma dentro al foglio, non con un `confirm()` del
 * browser: un dialogo nativo blocca tutto e non somiglia a niente del resto
 * dell'app.
 */
export function ListSettingsSheet({
  listId,
  name,
  description,
  defaultRole,
}: {
  listId: string;
  name: string;
  description: string | null;
  defaultRole: ListDefaultRole;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState(name);
  const [descrizione, setDescrizione] = useState(description ?? "");
  const [ruolo, setRuolo] = useState<ListDefaultRole>(defaultRole);
  const [conferma, setConferma] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apri() {
    setNome(name);
    setDescrizione(description ?? "");
    setRuolo(defaultRole);
    setConferma(false);
    setErrore(null);
    setOpen(true);
  }

  function salva() {
    startTransition(async () => {
      const esito = await updateList(listId, nome, descrizione, ruolo);
      if (!esito.ok) {
        setErrore(esito.error ?? "Non è riuscito, riprova.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function elimina() {
    startTransition(async () => {
      const esito = await deleteList(listId);
      if (!esito.ok) {
        setErrore(esito.error ?? "Non è riuscito, riprova.");
        return;
      }
      setOpen(false);
      router.replace("/lists");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={apri}
        className="rounded-full border border-white/[0.1] px-3 py-1.5 text-xs text-muted transition hover:bg-white/[0.06] hover:text-white"
      >
        Modifica
      </button>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <h2 className="text-xl font-bold tracking-tight">Modifica lista</h2>
        <div className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="list-settings-name"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted"
            >
              Nome
            </label>
            <input
              id="list-settings-name"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={80}
              className="w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm outline-none transition focus:border-accent focus:bg-white/[0.07]"
            />
          </div>
          <div>
            <label
              htmlFor="list-settings-description"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted"
            >
              Descrizione{" "}
              <span className="font-normal normal-case tracking-normal">(opzionale)</span>
            </label>
            <textarea
              id="list-settings-description"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              maxLength={280}
              rows={3}
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm leading-6 outline-none transition focus:border-accent focus:bg-white/[0.07]"
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <div>
              <p className="text-sm font-semibold">Permesso predefinito</p>
              <p className="mt-1 text-xs text-muted">Vale per i nuovi invitati.</p>
            </div>
            <select
              value={ruolo}
              aria-label="Permesso predefinito"
              onChange={(e) => setRuolo(e.target.value as ListDefaultRole)}
              className="rounded-lg border border-white/10 bg-bg px-2.5 py-2 text-xs outline-none focus:border-accent"
            >
              <option value="viewer">Sola lettura</option>
              <option value="editor">Può modificare</option>
            </select>
          </div>
        </div>
        {errore && <p className="mt-4 text-sm text-danger">{errore}</p>}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
          {conferma ? (
            <button
              type="button"
              disabled={pending}
              onClick={elimina}
              className="rounded-full border border-danger/40 px-4 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-50"
            >
              Confermi? Elimina
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConferma(true)}
              className="rounded-full px-4 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-50"
            >
              Elimina lista
            </button>
          )}
          <button
            type="button"
            disabled={pending || nome.trim().length === 0}
            onClick={salva}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Salvo…" : "Salva"}
          </button>
        </div>
      </Sheet>
    </>
  );
}
