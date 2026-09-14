"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/social/Avatar";
import { Sheet } from "@/components/ui/Sheet";
import { createList, inviteListMember } from "@/lib/lists/actions";
import { selectedMemberRoles, type InitialMemberRole } from "@/lib/lists/members";
import type { MiniProfile } from "@/lib/social/queries";

type DefaultRole = "viewer" | "editor";

export function CreateListSheet({
  onCreated,
  friends = [],
}: {
  onCreated?: (id: string) => void;
  friends?: MiniProfile[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultRole, setDefaultRole] = useState<DefaultRole>("viewer");
  const [shared, setShared] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<
    Record<string, InitialMemberRole>
  >({});
  const [createdListId, setCreatedListId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resetForm() {
    setName("");
    setDescription("");
    setDefaultRole("viewer");
    setShared(false);
    setSelectedFriends({});
    setCreatedListId(null);
    setError(null);
  }
  function openSheet() {
    resetForm();
    setOpen(true);
  }
  function closeSheet() {
    if (pending) return;
    if (createdListId) {
      finish(createdListId);
      return;
    }
    setOpen(false);
    resetForm();
  }
  function finish(listId: string) {
    setOpen(false);
    resetForm();
    if (onCreated) onCreated(listId);
    else router.push(`/lists/${listId}`);
  }
  function submit() {
    startTransition(async () => {
      setError(null);
      let listId = createdListId;
      if (!listId) {
        const result = await createList(name, description, defaultRole);
        if (!result.ok || !result.id) {
          setError(result.error ?? "Non è riuscito, riprova.");
          return;
        }
        listId = result.id;
        setCreatedListId(listId);
      }
      if (shared) {
        const invitations = selectedMemberRoles(
          Object.entries(selectedFriends).map(([userId, role]) => ({ userId, role })),
        );
        const results = await Promise.allSettled(
          invitations.map(({ userId, role }) => inviteListMember(listId, userId, role)),
        );
        const firstFailure = results.find(
          (result) => result.status === "rejected" || !result.value.ok,
        );
        if (firstFailure) {
          const detail =
            firstFailure.status === "fulfilled" ? firstFailure.value.error : undefined;
          setError(
            `La lista è stata creata, ma alcuni inviti non sono riusciti. ${detail ?? "Riprova."}`,
          );
          return;
        }
      }
      finish(listId);
    });
  }

  const fieldClass =
    "w-full rounded-[14px] border border-white/10 bg-surface-2 px-4 py-3 text-sm outline-none transition placeholder:text-muted/60 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30";
  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className="rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(131,95,255,0.25)] transition hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pale"
      >
        Crea lista
      </button>
      <Sheet
        open={open}
        onClose={closeSheet}
        size="tall"
        className={`md:max-h-[min(760px,calc(100svh-48px))] md:rounded-[28px] md:border md:border-white/10 md:px-7 md:pt-5 lg:top-1/2 lg:bottom-auto lg:-translate-y-1/2 ${shared ? "md:max-w-[960px]" : "md:max-w-[640px]"}`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              Crea una lista
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
              Raccogli i titoli che vuoi tenere a portata di mano.
            </p>
          </div>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Chiudi"
            disabled={pending}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-xl leading-none text-muted transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ×
          </button>
        </div>
        <div className="grid gap-2 min-[420px]:grid-cols-2">
          {[
            {
              value: false,
              label: "Personale",
              detail: "Suggerimenti scelti dai tuoi gusti",
              icon: "bookmark",
            },
            {
              value: true,
              label: "Condivisa",
              detail: "Costruiscila insieme ai tuoi amici",
              icon: "users",
            },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={shared === option.value}
              onClick={() => setShared(option.value)}
              disabled={pending || createdListId !== null}
              className={`group flex items-center gap-3 rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default ${shared === option.value ? "border-accent bg-accent/[0.12]" : "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.06]"}`}
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${shared === option.value ? "bg-accent text-white" : "bg-white/[0.08] text-muted group-hover:text-white"}`}
              >
                {option.icon === "bookmark" ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-3.5L6 21V4.75Z" />
                  </svg>
                ) : (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.8" />
                  </svg>
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-0.5 block text-xs leading-4 text-muted">
                  {option.detail}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div
          className={`mt-5 grid gap-5 ${shared ? "md:grid-cols-2 md:gap-6" : "grid-cols-1"}`}
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="list-name" className="mb-2 block text-sm font-medium">
                Nome
              </label>
              <input
                id="list-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                disabled={pending || createdListId !== null}
                placeholder="Es. Serate da recuperare"
                className={fieldClass}
              />
            </div>
            <div>
              <label
                htmlFor="list-description"
                className="mb-2 block text-sm font-medium"
              >
                Descrizione <span className="font-normal text-muted">(opzionale)</span>
              </label>
              <textarea
                id="list-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={280}
                disabled={pending || createdListId !== null}
                placeholder="Un tema, un mood, una prossima serata..."
                rows={3}
                className={`${fieldClass} resize-none leading-6`}
              />
            </div>
            {shared && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="flex flex-col gap-3 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between">
                  <div>
                    <p className="text-sm font-semibold">Ruolo dei nuovi invitati</p>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      Chi può modificare contribuisce alla lista; chi è in sola lettura
                      no.
                    </p>
                  </div>
                  <select
                    value={defaultRole}
                    disabled={pending || createdListId !== null}
                    onChange={(event) =>
                      setDefaultRole(event.target.value as DefaultRole)
                    }
                    className="rounded-lg border border-white/10 bg-bg px-2.5 py-2 text-xs outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
                  >
                    <option value="viewer">Sola lettura</option>
                    <option value="editor">Può modificare</option>
                  </select>
                </div>
              </div>
            )}
          </div>
          {shared && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 md:p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Partecipanti</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Tu e chi può modificare contribuite alla lista.
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-accent-pale">
                  {Object.keys(selectedFriends).length} selezionati
                </span>
              </div>
              <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
                {friends.length === 0 ? (
                  <p className="rounded-xl bg-white/[0.04] px-3 py-4 text-xs leading-5 text-muted">
                    Aggiungi prima qualche amico a Zapp.
                  </p>
                ) : (
                  friends.map((friend) => {
                    const role = selectedFriends[friend.id];
                    const displayName = friend.display_name || `@${friend.username}`;
                    return (
                      <div
                        key={friend.id}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${role ? "border-accent/40 bg-accent/[0.08]" : "border-transparent bg-white/[0.025] hover:border-white/10"}`}
                      >
                        <button
                          type="button"
                          aria-pressed={Boolean(role)}
                          aria-label={`${role ? "Rimuovi" : "Aggiungi"} ${displayName}`}
                          disabled={pending || createdListId !== null}
                          onClick={() =>
                            setSelectedFriends((current) => {
                              const next = { ...current };
                              if (role) delete next[friend.id];
                              else next[friend.id] = defaultRole;
                              return next;
                            })
                          }
                          className={`flex size-6 shrink-0 items-center justify-center rounded-md border text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${role ? "border-accent bg-accent text-white" : "border-white/20 text-transparent"}`}
                        >
                          {role ? "✓" : ""}
                        </button>
                        <Avatar url={friend.avatar_url} name={displayName} size={32} />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {displayName}
                        </span>
                        {role && (
                          <select
                            value={role}
                            aria-label={`Permesso di ${friend.username}`}
                            disabled={pending || createdListId !== null}
                            onChange={(event) =>
                              setSelectedFriends((current) => ({
                                ...current,
                                [friend.id]: event.target.value as InitialMemberRole,
                              }))
                            }
                            className="max-w-[112px] rounded-lg border border-white/10 bg-bg px-2 py-1.5 text-[11px] outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
                          >
                            <option value="viewer">Lettura</option>
                            <option value="editor">Modifica</option>
                          </select>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-5 text-sm leading-5 text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex items-center justify-end gap-2 border-t border-white/10 pt-5">
          <button
            type="button"
            onClick={closeSheet}
            disabled={pending}
            className="rounded-full px-4 py-2.5 text-sm font-semibold text-muted transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {createdListId ? "Apri lista" : "Annulla"}
          </button>
          <button
            type="button"
            disabled={pending || name.trim().length === 0}
            onClick={submit}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(131,95,255,0.25)] transition hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-pale disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending
              ? createdListId
                ? "Riprovo..."
                : "Creo..."
              : createdListId
                ? "Riprova inviti"
                : "Crea lista"}
          </button>
        </div>
      </Sheet>
    </>
  );
}
