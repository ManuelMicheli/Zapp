"use client";

import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CommentComposer } from "@/components/comments/CommentComposer";
import { CommentContent } from "@/components/comments/CommentContent";
import { Avatar } from "@/components/social/Avatar";
import { useToast } from "@/components/ui/Toaster";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/format";
import { useMirroredValue, withAppended } from "@/lib/ui/optimistic";
import {
  addComment,
  reportContent,
  toggleReviewLike,
  upsertReview,
} from "@/lib/social/actions";
import { setRating } from "@/lib/watch/actions";
import { ReviewScore, scoreGutter } from "./ReviewScore";

/** Prefisso dell'id di un commento appena scritto, non ancora tornato dal server. */
const PENDING_PREFIX = "in-corso-";

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

export interface RatingBucket {
  rating: number;
  n: number;
}

interface Props {
  titleId: number;
  mediaType: "movie" | "tv";
  zappAvg: number | null;
  zappCount: number;
  /** Quanti voti per ogni valore 1-10 (RPC `title_rating_histogram`). */
  histogram: RatingBucket[];
  reviews: ReviewView[];
  myReview: ReviewView | null;
  viewerWatched: boolean;
  myRating: number | null;
  /**
   * La chicca del titolo (`TitleTrivia`, componente server passato come nodo):
   * chiude l'elenco delle recensioni come una recensione qualsiasi. `null` sui
   * titoli che non ne hanno.
   */
  trivia?: ReactNode;
  comments?: ReactNode;
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
  const router = useRouter();
  const { value: writing, pending, run, set: setWriting } = useMirroredValue(false);
  const [body, setBody] = useState(props.myReview?.body ?? "");
  const [spoilers, setSpoilers] = useState(props.myReview?.hasSpoilers ?? false);
  const [rating, setLocalRating] = useState(props.myRating);

  function submitReview() {
    setWriting(false); // il modulo si chiude subito: la recensione arriva col refresh
    run(
      false,
      async () => {
        const result = await upsertReview(props.titleId, props.mediaType, body, spoilers);
        if (result.ok && rating !== props.myRating && rating != null) {
          await setRating(props.titleId, props.mediaType, rating);
        }
        return result;
      },
      { message: "Recensione pubblicata", onDone: () => router.refresh() },
    );
  }

  return (
    <section className="flex flex-col gap-3 px-5 md:px-0">
      <h2 className="text-xl font-bold tracking-[-0.03em]">Voti e recensioni</h2>

      <RatingSummary
        avg={props.zappAvg}
        count={props.zappCount}
        histogram={props.histogram}
        myRating={rating}
      />
      {props.comments}

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
              className="h-11 flex-1 rounded-full glass-accent text-sm font-semibold text-white disabled:opacity-50"
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

      {props.reviews.length === 0 && !props.trivia ? (
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
          {props.trivia}
        </div>
      )}
    </section>
  );
}

/**
 * Voti su Zapp: media grande e distribuzione da 10 a 1 (scelta utente 2026-09-07,
 * mockup "Simili e recensioni C"). I conteggi arrivano dall'RPC aggregata: nella
 * pagina non compare mai chi ha dato quel voto.
 */
function RatingSummary({
  avg,
  count,
  histogram,
  myRating,
}: {
  avg: number | null;
  count: number;
  histogram: RatingBucket[];
  myRating: number | null;
}) {
  if (count === 0 || avg == null) {
    return (
      <p className={`${CARD} p-4 text-sm text-muted`}>Nessun voto su Zapp per ora.</p>
    );
  }

  const byRating = new Map(histogram.map((h) => [h.rating, h.n]));
  const max = Math.max(1, ...histogram.map((h) => h.n));
  const values = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

  return (
    <div className={`${CARD} flex flex-col gap-4 p-4`}>
      <div className="flex items-center gap-5">
        <div className="flex flex-col gap-0.5">
          <b className="text-[40px] font-light leading-none tracking-[-0.04em]">
            {avg.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
          </b>
          <span className="text-[11px] text-muted-2">
            su 10 · {count} {count === 1 ? "voto" : "voti"}
            {count < 5 ? " (ancora pochi)" : ""}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-[3px]">
          {values.map((v) => {
            const n = byRating.get(v) ?? 0;
            return (
              <div key={v} className="flex items-center gap-2">
                <span className="w-4 text-right text-[10px] tabular-nums text-muted-2">
                  {v}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                  {/* tutte le barre nel viola chiaro dell'accento (scelta utente 2026-09-07) */}
                  <span
                    className="block h-full rounded-full bg-accent-light"
                    style={{ width: `${Math.round((n / max) * 100)}%` }}
                  />
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {myRating != null && (
        <>
          <div className="h-px bg-border" />
          <p className="text-center text-xs text-muted">
            Il tuo voto: <b className="font-bold text-accent-soft">★ {myRating}</b>
          </p>
        </>
      )}
    </div>
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
  const { value: likeState, run: runLike } = useMirroredValue({
    liked: review.likedByMe,
    count: review.likeCount,
  });
  const [commentsOpen, setCommentsOpen] = useState(false);

  return (
    <article
      className={`${CARD} relative isolate flex flex-col gap-2.5 overflow-hidden p-3.5 ${
        review.authorRating != null ? scoreGutter(review.authorRating) : ""
      }`}
    >
      {review.authorRating != null && <ReviewScore rating={review.authorRating} />}
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
            const next = !likeState.liked;
            runLike(
              { liked: next, count: Math.max(0, likeState.count + (next ? 1 : -1)) },
              () => toggleReviewLike(review.id, next),
            );
          }}
          className={`-my-2 py-2 ${likeState.liked ? "font-semibold text-accent-soft" : ""}`}
          aria-label={likeState.liked ? "Togli mi piace" : "Mi piace"}
        >
          {likeState.liked ? "♥" : "♡"} {likeState.count}
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
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("review_comments")
      .select(
        "id, user_id, parent_id, body, has_spoilers, created_at, author:profiles!review_comments_user_id_fkey(username, display_name, avatar_url)",
      )
      .eq("review_id", reviewId)
      .order("created_at", { ascending: true });
    if (!error) setComments((data as CommentRow[] | null) ?? []);
  }, [reviewId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (comments === null) {
    return <p className="text-xs text-muted">Caricamento commenti…</p>;
  }

  const roots = comments.filter((c) => c.parent_id === null);
  const replies = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  async function submit(body: string) {
    const previous = comments;
    const parent = replyTo;
    setComments(
      withAppended(comments ?? [], (c) => c.id, {
        id: `${PENDING_PREFIX}${Date.now()}`,
        user_id: "",
        parent_id: parent,
        body,
        has_spoilers: false,
        created_at: new Date().toISOString(),
        author: null,
      }),
    );
    try {
      const result = await addComment(reviewId, body, parent, false);
      if (!result.ok) setComments(previous);
      else {
        setReplyTo(null);
        void load();
      }
      return result;
    } catch (error) {
      setComments(previous);
      throw error;
    }
  }

  return (
    <div className="border-t border-border pt-3">
      {roots.map((comment) => (
        <div key={comment.id} className="mb-2">
          <CommentBody comment={comment} viewerWatched={viewerWatched} />
          <button
            type="button"
            disabled={comment.id.startsWith(PENDING_PREFIX)}
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

      <CommentComposer
        onSubmit={submit}
        placeholder={replyTo ? "Rispondi…" : "Commenta…"}
      />
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
  const name = comment.id.startsWith(PENDING_PREFIX)
    ? "Tu"
    : (comment.author?.display_name ?? comment.author?.username ?? "utente");

  return (
    <div className="flex items-start gap-2">
      <Avatar url={comment.author?.avatar_url ?? null} name={name} size={24} />
      <div className="min-w-0 flex-1">
        <p className="text-xs">
          <span className="font-semibold">{name}</span>{" "}
          {revealed ? (
            <CommentContent body={comment.body} />
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
