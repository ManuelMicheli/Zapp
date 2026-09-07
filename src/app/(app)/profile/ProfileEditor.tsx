"use client";

import { useState, useTransition } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { AvatarPicker } from "@/components/profile/AvatarPicker";
import { AvatarHalo } from "@/components/profile/AvatarHalo";
import { Avatar } from "@/components/social/Avatar";
import { GlassIconButton } from "@/components/layout/GlassIconButton";
import { setProfilePrivacy, updateProfile } from "./actions";

const FIELD_CLASS =
  "h-[54px] w-full rounded-[14px] border border-transparent bg-surface-2 px-[18px] text-base text-text outline-none placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/15";

interface Friend {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Primi amici mostrati come avatar sovrapposti sotto il nome. */
  friends: Friend[];
  friendCount: number;
}

/**
 * Testata del profilo sopra il muro di locandine: ingranaggio (unico
 * comando, apre lo sheet di modifica), avatar con anello conico, nome e
 * riga amici.
 */
export function ProfileEditor({
  userId,
  username,
  displayName,
  avatarUrl,
  friends,
  friendCount,
}: Props) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <div className="absolute inset-x-5 top-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] z-10 flex items-center justify-end lg:inset-x-10">
        <GlassIconButton
          label="Modifica profilo"
          onClick={() => setEditOpen(true)}
          className="relative after:absolute after:-inset-0.5 after:content-['']"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </GlassIconButton>
      </div>

      {/* Identità ancorata al fondo della testata: sopra resta il muro di
          locandine, che così si vede fin dietro l'immagine profilo. */}
      <div className="absolute inset-x-0 bottom-9 z-10 flex flex-col items-center gap-3.5 lg:bottom-12">
        <AvatarHalo>
          <AvatarPicker
            userId={userId}
            initialUrl={avatarUrl}
            name={displayName || username}
            size={124}
            showLabel={false}
            onChange={() => show("Avatar aggiornato")}
          />
        </AvatarHalo>

        <div className="flex flex-col items-center gap-1 px-5 text-center">
          <p className="text-[34px] font-extrabold leading-none tracking-[-0.05em]">
            {displayName || username}
          </p>
          <p className="text-[15px] text-white/55">@{username}</p>
        </div>

        {friendCount > 0 && (
          <div className="flex items-center gap-2 text-[13px] text-white/70">
            <div className="flex items-center">
              {friends.map((f) => (
                <div
                  key={f.id}
                  className="-ml-2 rounded-full ring-2 ring-bg first:ml-0"
                  aria-hidden="true"
                >
                  <Avatar
                    url={f.avatar_url}
                    name={f.display_name || f.username}
                    size={22}
                  />
                </div>
              ))}
            </div>
            <span>
              {friendCount} {friendCount === 1 ? "amico" : "amici"}
            </span>
          </div>
        )}
      </div>

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
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="p-username" className="px-1 text-sm font-medium text-muted">
              Username
            </label>
            <input
              id="p-username"
              name="username"
              defaultValue={username}
              required
              pattern="[a-z0-9_]{3,20}"
              autoCapitalize="none"
              className={FIELD_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="p-display" className="px-1 text-sm font-medium text-muted">
              Nome visualizzato
            </label>
            <input
              id="p-display"
              name="display_name"
              defaultValue={displayName}
              maxLength={50}
              className={FIELD_CLASS}
            />
          </div>
          {error && <p className="px-1 text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            Salva
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** Riga impostazioni con interruttore stile iOS per il profilo privato. */
export function PrivacyRow({ isPrivate }: { isPrivate: boolean }) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [privacy, setPrivacy] = useState(isPrivate);

  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-4">
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">Profilo privato</span>
        <span className="text-xs text-muted">Solo gli amici vedranno le tue liste.</span>
      </span>
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
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg ${
          privacy ? "bg-accent" : "bg-white/[0.14]"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 size-[26px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.4)] transition-transform ${
            privacy ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </label>
  );
}
