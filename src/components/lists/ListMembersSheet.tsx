"use client";

import { useState, useTransition } from "react";
import { Sheet } from "@/components/ui/Sheet";
import {
  inviteListMember,
  removeListMember,
  setListMemberRole,
} from "@/lib/lists/actions";
import type { MiniProfile } from "@/lib/social/queries";
import type { TitleListMember } from "@/lib/lists/queries";

export function ListMembersSheet({
  listId,
  members,
  friends,
  canManage,
}: {
  listId: string;
  members: TitleListMember[];
  friends: MiniProfile[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const memberIds = new Set(members.map((member) => member.userId));
  const invitees = friends.filter((friend) => !memberIds.has(friend.id));
  function run(action: () => Promise<{ ok: boolean }>) {
    startTransition(() => {
      void action().then(() => setOpen(false));
    });
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-white/[0.1] px-3 py-2 text-sm font-semibold text-muted"
      >
        Membri
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Membri della lista">
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {member.displayName || `@${member.username}`}
                </p>
                <p className="text-xs text-muted">
                  {member.role === "owner"
                    ? "Proprietario"
                    : member.role === "editor"
                      ? "Può modificare"
                      : "Sola lettura"}
                </p>
              </div>
              {canManage && member.role !== "owner" && (
                <>
                  <select
                    aria-label={`Ruolo di ${member.username}`}
                    defaultValue={member.role}
                    disabled={pending}
                    onChange={(event) =>
                      run(() =>
                        setListMemberRole(
                          listId,
                          member.userId,
                          event.target.value as "viewer" | "editor",
                        ),
                      )
                    }
                    className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                  >
                    <option value="viewer">Legge</option>
                    <option value="editor">Modifica</option>
                  </select>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => removeListMember(listId, member.userId))}
                    className="text-xs text-danger"
                  >
                    Rimuovi
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        {canManage && invitees.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-sm font-semibold">Invita un amico</p>
            <div className="space-y-1">
              {invitees.map((friend) => (
                <button
                  key={friend.id}
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => inviteListMember(listId, friend.id))}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2"
                >
                  <span>{friend.display_name || `@${friend.username}`}</span>
                  <span className="text-accent">Invita</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
