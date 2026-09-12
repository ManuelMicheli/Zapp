"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/social/Avatar";
import { Sheet } from "@/components/ui/Sheet";
import { createList, inviteListMember } from "@/lib/lists/actions";
import { selectedMemberRoles, type InitialMemberRole } from "@/lib/lists/members";
import type { MiniProfile } from "@/lib/social/queries";

export function CreateListSheet({ onCreated, friends = [] }: { onCreated?: (id: string) => void; friends?: MiniProfile[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultRole, setDefaultRole] = useState<"viewer" | "editor">("viewer");
  const [shared, setShared] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<Record<string, InitialMemberRole>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openSheet() {
    setShared(false);
    setName("");
    setDescription("");
    setDefaultRole("viewer");
    setSelectedFriends({});
    setError(null);
    setOpen(true);
  }

  function submit() {
    startTransition(async () => {
      const result = await createList(name, description, defaultRole);
      if (!result.ok || !result.id) {
        setError(result.error ?? "Non e riuscito, riprova.");
        return;
      }
      if (shared) {
        const invitations = selectedMemberRoles(Object.entries(selectedFriends).map(([userId, role]) => ({ userId, role })));
        await Promise.all(invitations.map(({ userId, role }) => inviteListMember(result.id!, userId, role)));
      }
      setOpen(false);
      setName("");
      setDescription("");
      setError(null);
      setShared(false);
      setSelectedFriends({});
      onCreated?.(result.id);
    });
  }

  return (
    <>
      <button type="button" onClick={openSheet} className="rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(131,95,255,0.25)] transition hover:bg-accent-strong">
        Crea lista
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} size="tall" className="md:max-h-[min(760px,calc(100svh-48px))] md:max-w-[880px] md:rounded-[28px] md:border md:border-white/10 md:px-7 md:pt-5">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">La tua selezione</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">Crea una lista</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">Raccogli i titoli che vuoi tenere a portata di mano, da solo o insieme ai tuoi amici.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Chiudi" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-xl leading-none text-muted transition hover:bg-white/[0.08] hover:text-white">×</button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {[{ value: false, label: "Personale", detail: "Solo per te", icon: "bookmark" }, { value: true, label: "Condivisa", detail: "Scegli chi puo partecipare", icon: "users" }].map((option) => (
            <button key={option.label} type="button" onClick={() => setShared(option.value)} className={`group rounded-2xl border p-4 text-left transition md:p-5 ${shared === option.value ? "border-accent bg-accent/[0.12] shadow-[inset_0_0_0_1px_rgba(163,140,255,0.2)]" : "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.06]"}`}>
              <span className={`mb-5 flex size-10 items-center justify-center rounded-xl ${shared === option.value ? "bg-accent text-white" : "bg-white/[0.08] text-muted group-hover:text-white"}`}>
                {option.icon === "bookmark" ? <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-3.5L6 21V4.75Z" /></svg> : <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.8" /></svg>}
              </span>
              <span className="block text-base font-semibold">{option.label}</span>
              <span className="mt-1 block text-xs text-muted">{option.detail}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.82fr)]">
          <div className="space-y-4">
            <div><label htmlFor="list-name" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted">Nome</label><input id="list-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Es. Serate da recuperare" className="w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm outline-none transition placeholder:text-muted/60 focus:border-accent focus:bg-white/[0.07]" /></div>
            <div><label htmlFor="list-description" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted">Descrizione <span className="font-normal normal-case tracking-normal">(opzionale)</span></label><textarea id="list-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={280} placeholder="Un tema, un mood, una prossima serata..." rows={3} className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-muted/60 focus:border-accent focus:bg-white/[0.07]" /></div>
            {shared && <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Permesso predefinito</p><p className="mt-1 text-xs text-muted">Vale per i nuovi invitati.</p></div><select value={defaultRole} onChange={(event) => setDefaultRole(event.target.value as "viewer" | "editor")} className="rounded-lg border border-white/10 bg-bg px-2.5 py-2 text-xs outline-none focus:border-accent"><option value="viewer">Sola lettura</option><option value="editor">Puo modificare</option></select></div></div>}
          </div>
          {shared && <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 md:p-5"><div className="flex items-end justify-between gap-3"><div><p className="text-sm font-semibold">Invita amici</p><p className="mt-1 text-xs text-muted">Decidi il ruolo per ogni persona.</p></div><span className="text-xs font-semibold text-accent">{Object.keys(selectedFriends).length} selezionati</span></div><div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">{friends.length === 0 ? <p className="rounded-xl bg-white/[0.04] px-3 py-4 text-xs leading-5 text-muted">Aggiungi prima qualche amico a Zapp.</p> : friends.map((friend) => { const role = selectedFriends[friend.id]; const displayName = friend.display_name || `@${friend.username}`; return <div key={friend.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${role ? "border-accent/40 bg-accent/[0.08]" : "border-transparent bg-white/[0.025] hover:border-white/10"}`}><button type="button" aria-pressed={Boolean(role)} aria-label={`${role ? "Rimuovi" : "Aggiungi"} ${displayName}`} onClick={() => setSelectedFriends((current) => { const next = { ...current }; if (role) delete next[friend.id]; else next[friend.id] = "viewer"; return next; })} className={`flex size-5 shrink-0 items-center justify-center rounded-md border text-xs ${role ? "border-accent bg-accent text-white" : "border-white/20 text-transparent"}`}>{role ? "✓" : ""}</button><Avatar url={friend.avatar_url} name={displayName} size={32} /><span className="min-w-0 flex-1 truncate text-sm">{displayName}</span>{role && <select value={role} aria-label={`Permesso di ${friend.username}`} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedFriends((current) => ({ ...current, [friend.id]: event.target.value as InitialMemberRole }))} className="max-w-[112px] rounded-lg border border-white/10 bg-bg px-2 py-1.5 text-[11px] outline-none focus:border-accent"><option value="viewer">Lettura</option><option value="editor">Modifica</option></select>}</div>; })}</div></div>}
        </div>
        {error && <p className="mt-5 text-sm text-danger">{error}</p>}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/10 pt-5"><button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 py-2.5 text-sm font-semibold text-muted transition hover:text-white">Annulla</button><button type="button" disabled={pending || name.trim().length === 0} onClick={submit} className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(131,95,255,0.25)] transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Creo..." : "Crea lista"}</button></div>
      </Sheet>
    </>
  );
}
