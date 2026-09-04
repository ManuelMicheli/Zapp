"use client";

import { useState, useTransition } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import { AvatarPicker } from "@/components/profile/AvatarPicker";
import { setProfilePrivacy, updateProfile } from "./actions";

interface Props {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isPrivate: boolean;
}

export function ProfileEditor({
  userId,
  username,
  displayName,
  avatarUrl,
  isPrivate,
}: Props) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState(isPrivate);

  return (
    <>
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5">
        <AvatarPicker
          userId={userId}
          initialUrl={avatarUrl}
          name={displayName || username}
          size={64}
          onChange={() => show("Avatar aggiornato")}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{displayName || username}</p>
          <p className="truncate text-sm text-muted">@{username}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="shrink-0 rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-xs font-semibold"
        >
          Modifica
        </button>
      </div>

      <label className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-surface p-4">
        <div>
          <p className="text-sm font-semibold">Profilo privato</p>
          <p className="text-xs text-muted">
            Solo gli amici vedranno le tue liste (dalla Fase social).
          </p>
        </div>
        <input
          type="checkbox"
          checked={privacy}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setPrivacy(next);
            startTransition(async () => {
              const result = await setProfilePrivacy(next);
              if (!result.ok) {
                setPrivacy(!next);
                show("Errore di salvataggio.");
              }
            });
          }}
          className="size-5 accent-[var(--color-accent)]"
        />
      </label>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Modifica profilo">
        <form
          action={(formData) => {
            startTransition(async () => {
              setError(null);
              const result = await updateProfile(formData);
              if (!result.ok) {
                setError(result.error ?? "Errore");
                return;
              }
              setEditOpen(false);
              show("Profilo aggiornato");
            });
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="p-username" className="mb-1 block text-sm font-medium">
              Username
            </label>
            <input
              id="p-username"
              name="username"
              defaultValue={username}
              required
              pattern="[a-z0-9_]{3,20}"
              autoCapitalize="none"
              className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-base outline-none focus:border-accent"
            />
          </div>
          <div>
            <label htmlFor="p-display" className="mb-1 block text-sm font-medium">
              Nome visualizzato
            </label>
            <input
              id="p-display"
              name="display_name"
              defaultValue={displayName}
              maxLength={50}
              className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-base outline-none focus:border-accent"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-accent py-3 text-base font-bold text-white disabled:opacity-50"
          >
            Salva
          </button>
        </form>
      </Sheet>
    </>
  );
}
