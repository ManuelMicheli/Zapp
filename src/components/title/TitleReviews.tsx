import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import type { CachedTitle } from "@/lib/tmdb/cache";
import { getFriendsData } from "@/lib/social/queries";
import type { EntrySnapshot } from "@/lib/watch/actions";
import { Suspense } from "react";
import { ReviewsClient, type ReviewView } from "./ReviewsClient";
import { TitleTrivia } from "./TitleTrivia";
import { TitleComments, type TitleCommentView, type CommentViewer } from "./TitleComments";

/** Sezione recensioni della scheda titolo (Fase 4). */
export async function TitleReviews({
  cached,
  entry,
}: {
  cached: CachedTitle;
  entry: EntrySnapshot | null;
}) {
  const { title } = cached;
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) return null;

  const [statsRes, histRes, reviewsRes, myLikesRes, commentsRes, { friends }, profileRes] = await Promise.all([
    supabase.rpc("title_rating_stats", {
      t_id: title.id,
      t_type: title.media_type,
    }),
    // distribuzione dei voti: aggregata su tutti gli utenti (RPC security definer),
    // le policy su watch_entries mostrerebbero solo sé e gli amici
    supabase.rpc("title_rating_histogram", {
      t_id: title.id,
      t_type: title.media_type,
    }),
    supabase
      .from("reviews_with_counts")
      .select(
        "*, author:profiles!reviews_user_id_fkey(id, username, display_name, avatar_url)",
      )
      .eq("title_id", title.id)
      .eq("media_type", title.media_type)
      .lt("report_count", 3)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("review_likes").select("review_id").eq("user_id", user.id),
    supabase.from("title_comments").select("id, body, has_spoilers, created_at, author:profiles!title_comments_user_id_fkey(username, display_name, avatar_url)").eq("title_id", title.id).eq("media_type", title.media_type).is("season_number", null).is("episode_number", null).order("created_at", { ascending: false }).limit(50),
    getFriendsData(),
    supabase.from("profiles").select("username, display_name, avatar_url").eq("id", user.id).maybeSingle(),
  ]);

  const stats = statsRes.data?.[0];
  const myLikes = new Set((myLikesRes.data ?? []).map((l) => l.review_id));
  const friendIds = new Set(friends.map((f) => f.id));
  const viewerWatched = entry?.status === "watched";

  const reviews: ReviewView[] = (reviewsRes.data ?? [])
    .filter((r) => r.id && r.author)
    .map((r) => ({
      id: r.id!,
      body: r.body ?? "",
      hasSpoilers: r.has_spoilers ?? false,
      createdAt: r.created_at ?? "",
      likeCount: Number(r.like_count ?? 0),
      commentCount: Number(r.comment_count ?? 0),
      likedByMe: myLikes.has(r.id!),
      isMine: r.user_id === user.id,
      isFriend: r.user_id != null && friendIds.has(r.user_id),
      author: {
        username: r.author!.username,
        displayName: r.author!.display_name,
        avatarUrl: r.author!.avatar_url,
      },
      authorRating: null,
    }));

  // voto dell'autore accanto alla recensione (da watch_entries, visibile via RLS
  // solo per sé e amici: per gli altri resta null)
  const authorIds = (reviewsRes.data ?? [])
    .map((r) => r.user_id)
    .filter((id): id is string => id != null);
  if (authorIds.length > 0) {
    const { data: ratings } = await supabase
      .from("watch_entries")
      .select("user_id, rating")
      .eq("title_id", title.id)
      .eq("media_type", title.media_type)
      .in("user_id", authorIds)
      .not("rating", "is", null);
    const ratingMap = new Map((ratings ?? []).map((r) => [r.user_id, r.rating]));
    for (let i = 0; i < reviews.length; i++) {
      const userId = (reviewsRes.data ?? [])[i]?.user_id;
      if (userId && ratingMap.has(userId)) {
        reviews[i] = { ...reviews[i], authorRating: ratingMap.get(userId) ?? null };
      }
    }
  }

  // ordina: amici → like → data
  reviews.sort((a, b) => {
    if (a.isFriend !== b.isFriend) return a.isFriend ? -1 : 1;
    if (a.likeCount !== b.likeCount) return b.likeCount - a.likeCount;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const myReview = reviews.find((r) => r.isMine) ?? null;
  const comments: TitleCommentView[] = (commentsRes.data ?? []).filter((c) => c.author).map((c) => ({ id: c.id, body: c.body, hasSpoilers: c.has_spoilers, createdAt: c.created_at, author: { username: c.author.username, displayName: c.author.display_name, avatarUrl: c.author.avatar_url } }));
  const viewer: CommentViewer | null = profileRes.data ? { username: profileRes.data.username, displayName: profileRes.data.display_name, avatarUrl: profileRes.data.avatar_url } : null;

  return (
    <ReviewsClient
      titleId={title.id}
      mediaType={title.media_type}
      zappAvg={stats && Number(stats.rating_count) > 0 ? Number(stats.avg_rating) : null}
      zappCount={stats ? Number(stats.rating_count) : 0}
      histogram={(histRes.data ?? []).map((h) => ({
        rating: Number(h.rating),
        n: Number(h.n),
      }))}
      reviews={reviews}
      myReview={myReview}
      viewerWatched={viewerWatched}
      myRating={entry?.rating ?? null}
      trivia={
        <Suspense fallback={null}>
          <TitleTrivia mediaType={title.media_type} tmdbId={title.id} />
        </Suspense>
      }
      comments={<TitleComments titleId={title.id} mediaType={title.media_type} initial={comments} viewer={viewer} />}
    />
  );
}
