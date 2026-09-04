"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/social/Avatar";
import { useToast } from "@/components/ui/Toaster";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/format";
import {
  addComment,
  reportContent,
  toggleReviewLike,
  upsertReview,
} from "@/lib/social/actions";
import { setRating } from "@/lib/watch/actions";

export interface ReviewView {
  id: string;
  body: string;
  hasSpoilers: boolean;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  isMine: boolean;
  isFriend: boolean;
  author: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  authorRating: number | null;
}

interface Props {
  titleId: number;
  mediaType: "movie" | "tv";
  zappAvg: number | null;
  zappCount: number;
  reviews: ReviewView[];
  myReview: ReviewView | null;
  viewerWatched: boolean;
  myRating: number | null;
}

const CARD = "rounded-[20px] border border-border bg-surface";

function StarOutline() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l2.94 6.26 6.87.86-5.06 4.73 1.3 6.79L12 17.27l-6.05 3.37 1.3-6.79L2.19 9.12l6.87-.86L12 2z" />
    </svg>
  );
}

export function ReviewsClient(props: Props) {
  const { show } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState(props.myReview?.body ?? "");
  const [spoilers, setSpoilers] = useState(props.myReview?.hasSpoilers ?? false);
  const [rating, setLocalRating] = useState(props.myRating);

  function submitReview() {
    startTransition(async () => {
      const result = await upsertReview(props.titleId, props.mediaType, body, spoilers);
      if (!result.ok) {
        show(result.error ?? "Errore");
        return;
      }
      if (rating !== props.myRating && rating != null) {
        await setRating(props.titleId, props.mediaType, rating);
      }
      setWriting(false);
      show("Recensione pubblicata");
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 px-5 lg:px-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold tracking-[-0.03em]">Recensioni</h2>
        <p className="text-[13px] text-muted">
          {props.zappAvg != null ? (
            <>
              Voto Zapp{" "}
              <b className="font-bold text-accent-soft">
                {props.zappAvg.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
              </b>{" "}
              su {props.zappCount} voti
            </>
          ) : (
            "Ancora pochi voti Zapp"
          )}
        </p>
      </div>

      {/* invito a votare/recensire: apre il form esistente */}
      {props.viewerWatched && !props.myReview && !writing && (
        <button
          type="button"
          onClick={() => setWriting(true)}
          className={`${CARD} flex items-center justify-between px-3.5 py-3`}
        >
          <span className="text-sm text-white/70">Cosa ne pensi?</span>
          <span className="flex gap-1 text-muted">
            {Array.from({ length: 5 }, (_, i) => (
              <StarOutline key={i} />
            ))}
          </span>
        </button>
      )}

      {props.viewerWatched && writing && (
        <div className={`${CARD} flex flex-col gap-3 p-3.5`}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 5000))}
            rows={4}
            placeholder="Cosa ne pensi?"
            className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={spoilers}
                onChange={(e) => setSpoilers(e.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Contiene spoiler
            </label>
            <select
              value={rating ?? ""}
              onChange={(e) =>
                setLocalRating(e.target.value ? Number(e.target.value) : null)
              }
              className="rounded-full border border-border bg-surface-2 px-3 py-2 text-xs"
            >
              <option value="">Voto…</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  ★ {n}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || body.trim().length === 0}
              onClick={submitReview}
              className="h-11 flex-1 rounded-full bg-accent text-sm font-semibold text-white shadow-[var(--shadow-accent)] disabled:opacity-50"
            >
              Pubblica
            </button>
            <button
              type="button"
              onClick={() => setWriting(false)}
              className="glass h-11 rounded-full px-5 text-sm font-semibold"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {props.myReview && !writing && (
        <button
          type="button"
          onClick={() => setWriting(true)}
          className="-my-1 self-start py-2.5 text-[13px] font-medium text-accent-soft"
        >
          Modifica la tua recensione
        </button>
      )}

      {props.reviews.length === 0 ? (
        <p className={`${CARD} p-4 text-center text-sm text-muted`}>
          Nessuna recensione. {props.viewerWatched ? "Scrivi la prima!" : ""}
        </p>
      ) : (
        <div className="space-y-2.5">
          {props.reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              viewerWatched={props.viewerWatched}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewCard({
  review,
  viewerWatched,
}: {
  review: ReviewView;
  viewerWatched: boolean;
}) {
  const { show } = useToast();
  const [, startTransition] = useTransition();
  // chi ha visto il titolo vede gli spoiler già aperti
  const [revealed, setRevealed] = useState(!review.hasSpoilers || viewerWatched);
  const [liked, setLiked] = useState(review.likedByMe);
  const [likeCount, setLikeCount] = useState(review.likeCount);
  const [commentsOpen, setCommentsOpen] = useState(false);

  return (
    <article className={`${CARD} flex flex-col gap-2.5 p-3.5`}>
      <header className="flex items-center gap-2.5">
        <Avatar
          url={review.author.avatarUrl}
          name={review.author.displayName ?? review.author.username}
          size={32}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <p className="truncate text-sm font-semibold">
            {review.author.displayName ?? review.author.username}
            {review.isFriend && (
              <span className="ml-1.5 text-[11px] font-medium text-accent-soft">
                amico
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted">{timeAgo(review.createdAt)}</p>
        </div>
        {review.authorRating != null && (
          <span className="shrink-0 text-sm font-bold text-accent-soft">
            ★ {review.authorRating}
          </span>
        )}
      </header>

      <div className="relative">
        <p
          className={`whitespace-pre-wrap text-sm leading-[1.5] text-white/80 ${
            revealed ? "" : "select-none blur-sm"
          }`}
        >
          {review.body}
        </p>
        {!revealed && (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="glass rounded-full px-4 py-1.5 text-xs font-semibold">
              Mostra spoiler
            </span>
          </button>
        )}
      </div>

      <footer className="flex items-center gap-4 text-xs text-muted">
        <button
          type="button"
          onClick={() => {
            const next = !liked;
            setLiked(next);
            setLikeCount((c) => c + (next ? 1 : -1));
            startTransition(async () => {
              const r = await toggleReviewLike(review.id, next);
              if (!r.ok) {
                setLiked(!next);
                setLikeCount((c) => c + (next ? -1 : 1));
              }
            });
          }}
          className={`-my-2 py-2 ${liked ? "font-semibold text-accent-soft" : ""}`}
          aria-label={liked ? "Togli mi piace" : "Mi piace"}
        >
          {liked ? "♥" : "♡"} {likeCount}
        </button>
        <button
          type="button"
          onClick={() => setCommentsOpen((v) => !v)}
          className="-my-2 py-2"
        >
          {review.commentCount} commenti
        </button>
        {!review.isMine && (
          <button
            type="button"
            className="-my-2 ml-auto py-2"
            onClick={() =>
              startTransition(async () => {
                await reportContent("review", review.id);
                show("Segnalazione inviata. Grazie.");
              })
            }
          >
            Segnala
          </button>
        )}
      </footer>

      {commentsOpen && <Comments reviewId={review.id} viewerWatched={viewerWatched} />}
    </article>
  );
}

interface CommentRow {
  id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  has_spoilers: boolean;
  created_at: string;
  author: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

function Comments({
  reviewId,
  viewerWatched,
}: {
  reviewId: string;
  viewerWatched: boolean;
}) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("review_comments")
      .select(
        "id, user_id, parent_id, body, has_spoilers, created_at, author:profiles!review_comments_user_id_fkey(username, display_name, avatar_url)",
      )
      .eq("review_id", reviewId)
      .order("created_at", { ascending: true });
    setComments((data as CommentRow[] | null) ?? []);
  }

  if (comments === null) {
    void load();
    return <p className="text-xs text-muted">Caricamento commenti…</p>;
  }

  const roots = comments.filter((c) => c.parent_id === null);
  const replies = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  function submit() {
    startTransition(async () => {
      const result = await addComment(reviewId, text, replyTo, false);
      if (!result.ok) {
        show(result.error ?? "Errore");
        return;
      }
      setText("");
      setReplyTo(null);
      await load();
    });
  }

  return (
    <div className="border-t border-border pt-3">
      {roots.map((comment) => (
        <div key={comment.id} className="mb-2">
          <CommentBody comment={comment} viewerWatched={viewerWatched} />
          <button
            type="button"
            onClick={() => setReplyTo(comment.id)}
            className="ml-8 py-1 text-[11px] font-medium text-accent-soft"
          >
            Rispondi
          </button>
          {replies(comment.id).map((reply) => (
            <div key={reply.id} className="ml-8 mt-1.5">
              <CommentBody comment={reply} viewerWatched={viewerWatched} />
            </div>
          ))}
        </div>
      ))}

      <div className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          placeholder={replyTo ? "Rispondi…" : "Commenta…"}
          className="h-11 min-w-0 flex-1 rounded-full border border-border bg-surface-2 px-4 text-xs outline-none focus:border-accent"
          onKeyDown={(e) => e.key === "Enter" && text.trim() && submit()}
        />
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={submit}
          className="h-11 shrink-0 rounded-full bg-accent px-4 text-xs font-semibold text-white disabled:opacity-50"
        >
          Invia
        </button>
      </div>
      {replyTo && (
        <button
          type="button"
          onClick={() => setReplyTo(null)}
          className="mt-1 py-1 text-[11px] text-muted"
        >
          Annulla risposta
        </button>
      )}
    </div>
  );
}

function CommentBody({
  comment,
  viewerWatched,
}: {
  comment: CommentRow;
  viewerWatched: boolean;
}) {
  const [revealed, setRevealed] = useState(!comment.has_spoilers || viewerWatched);
  const name = comment.author?.display_name ?? comment.author?.username ?? "utente";

  return (
    <div className="flex items-start gap-2">
      <Avatar url={comment.author?.avatar_url ?? null} name={name} size={24} />
      <div className="min-w-0 flex-1">
        <p className="text-xs">
          <span className="font-semibold">{name}</span>{" "}
          {revealed ? (
            <span className="text-white/80">{comment.body}</span>
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="text-muted underline"
            >
              spoiler — mostra
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
