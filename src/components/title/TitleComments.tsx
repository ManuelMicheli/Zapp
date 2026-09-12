"use client";

import { useState, useTransition } from "react";
import { CommentComposer } from "@/components/comments/CommentComposer";
import { CommentContent } from "@/components/comments/CommentContent";
import { Avatar } from "@/components/social/Avatar";
import {
  addTitleComment,
  deleteTitleComment,
  reportContent,
} from "@/lib/social/actions";
import { useToast } from "@/components/ui/Toaster";

export interface TitleCommentView {
  id: string;
  body: string;
  hasSpoilers: boolean;
  createdAt: string;
  author: { displayName: string | null; username: string; avatarUrl: string | null };
}
export interface CommentViewer {
  displayName: string | null;
  username: string;
  avatarUrl: string | null;
}

export function TitleComments({
  titleId,
  mediaType,
  seasonNumber = null,
  episodeNumber = null,
  initial = [],
  compact = false,
  viewer,
}: {
  titleId: number;
  mediaType: "movie" | "tv";
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  initial?: TitleCommentView[];
  compact?: boolean;
  viewer?: CommentViewer | null;
}) {
  const [comments, setComments] = useState(initial);
  // Lo spoiler e' una dichiarazione di chi scrive: la colonna esisteva dal primo
  // giorno e `CommentContent` sapeva gia' coprire il testo, ma nessuno poteva
  // accendere l'interruttore e ogni commento partiva "senza spoiler".
  const [spoiler, setSpoiler] = useState(false);
  const [pending, startTransition] = useTransition();
  const { show } = useToast();
  async function submit(body: string) {
    const hasSpoilers = spoiler;
    const result = await addTitleComment(
      titleId,
      mediaType,
      seasonNumber,
      episodeNumber,
      body,
      hasSpoilers,
    );
    if (result.ok)
      setComments((prev) => [
        {
          id: `pending-${Date.now()}`,
          body,
          hasSpoilers,
          createdAt: new Date().toISOString(),
          author: viewer ?? { displayName: "Tu", username: "tu", avatarUrl: null },
        },
        ...prev,
      ]);
    if (result.ok) setSpoiler(false);
    return result;
  }
  return (
    <section
      className={
        compact
          ? "border border-border/80 bg-surface/60 px-3.5 py-3"
          : "rounded-[20px] border border-accent/20 bg-surface p-4"
      }
    >
      {compact ? (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Commenti su S{seasonNumber}E{episodeNumber}
        </p>
      ) : (
        <div className="mb-3">
          <h2 className="text-xl font-bold tracking-[-0.03em]">Parliamone</h2>
          <p className="mt-1 text-sm text-muted">
            Una scena, una domanda, un pensiero: qui non serve scrivere una recensione.
          </p>
        </div>
      )}
      {comments.length > 0 && (
        <div className="mb-3 space-y-3">
          {comments.map((c) => {
            // Il commento appena scritto non ha ancora un id vero: niente
            // bottoni finche' il server non lo conferma.
            const salvato = !c.id.startsWith("pending-");
            const mio = Boolean(viewer && c.author.username === viewer.username);
            return (
              <div key={c.id} className="flex gap-2.5">
                <Avatar
                  url={c.author.avatarUrl}
                  name={c.author.displayName ?? c.author.username}
                  size={28}
                />
                <div className="min-w-0 flex-1">
                  <p className="min-w-0 text-sm leading-relaxed">
                    <b>{c.author.displayName ?? c.author.username}</b>{" "}
                    <CommentContent body={c.body} hasSpoilers={c.hasSpoilers} />
                  </p>
                  {salvato && (
                    <div className="mt-0.5 flex gap-3 text-[11px] text-muted">
                      {mio ? (
                        <button
                          type="button"
                          disabled={pending}
                          className="-my-1 py-1"
                          onClick={() =>
                            startTransition(async () => {
                              const esito = await deleteTitleComment(c.id);
                              if (!esito.ok) {
                                show(esito.error ?? "Riprova.");
                                return;
                              }
                              setComments((prev) => prev.filter((x) => x.id !== c.id));
                              show("Commento eliminato.");
                            })
                          }
                        >
                          Elimina
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          className="-my-1 py-1"
                          onClick={() =>
                            startTransition(async () => {
                              const esito = await reportContent("title_comment", c.id);
                              show(
                                esito.ok
                                  ? "Segnalazione inviata. Grazie."
                                  : (esito.error ?? "Riprova."),
                              );
                            })
                          }
                        >
                          Segnala
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-start gap-2">
        <div className="pt-6">
          <Avatar
            url={viewer?.avatarUrl ?? null}
            name={viewer?.displayName ?? viewer?.username ?? "Tu"}
            size={28}
          />
        </div>
        <div className="min-w-0 flex-1">
          <CommentComposer
            onSubmit={submit}
            placeholder={
              compact ? "Scrivi un pensiero su questo episodio…" : "Cosa ti è rimasto?"
            }
            submitLabel="Pubblica"
          />
          <label className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={spoiler}
              onChange={(e) => setSpoiler(e.target.checked)}
              className="size-3.5 accent-[var(--color-accent)]"
            />
            Contiene spoiler
          </label>
        </div>
      </div>
    </section>
  );
}
