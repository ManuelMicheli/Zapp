import { createClient } from "@/lib/supabase/server";
import type { CachedTitle } from "@/lib/tmdb/cache";
import { getFriendsData } from "@/lib/social/queries";
import type { EntrySnapshot } from "@/lib/watch/actions";
import { ReviewsClient, type ReviewView } from "./ReviewsClient";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [statsRes, reviewsRes, myLikesRes, { friends }] = await Promise.all([
    supabase.rpc("title_rating_stats", {
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
    getFriendsData(),
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

  return (
    <ReviewsClient
      titleId={title.id}
      mediaType={title.media_type}
      zappAvg={stats && Number(stats.rating_count) >= 5 ? Number(stats.avg_rating) : null}
      zappCount={stats ? Number(stats.rating_count) : 0}
      reviews={reviews}
      myReview={myReview}
      viewerWatched={viewerWatched}
      myRating={entry?.rating ?? null}
    />
  );
}
