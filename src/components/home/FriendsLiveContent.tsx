"use client";
import type { HomeRecommendation, FriendWatchingItem } from "@/lib/social/queries";
import type { FriendLiveSession } from "@/lib/watch/social-live";
import { visiblePresence } from "@/lib/watch/presence";
import { useFriendsLive, useLiveClock } from "./WatchingProvider";
import { useHomeType } from "./HomeType";
import { FriendsWatchingRow } from "./FriendsWatchingRow";
import { RecommendationsSection } from "./RecommendationsSection";

export function FriendsLiveContent({
  recommendations,
  watching,
  initialLive,
  renderedAt,
}: {
  recommendations: HomeRecommendation[];
  watching: FriendWatchingItem[];
  initialLive: FriendLiveSession[];
  renderedAt: number;
}) {
  const current = useFriendsLive();
  const now = useLiveClock() || renderedAt;
  const live = visiblePresence(current ?? initialLive, now);
  const tab = useHomeType()?.type ?? "all";
  const shownLive = live.filter((s) => tab === "all" || s.mediaType === tab);
  const shown = watching.filter(
    (s) =>
      (tab === "all" || s.mediaType === tab) && !live.some((l) => l.userId === s.userId),
  );
  const hasRecommendations = recommendations.some(
    (r) => tab === "all" || r.mediaType === tab,
  );
  if (!shownLive.length && !shown.length && !hasRecommendations) return null;
  return (
    <section className="space-y-4">
      <h2 className="px-5 text-xl font-bold tracking-[-0.03em] lg:px-10">I tuoi amici</h2>
      <RecommendationsSection items={recommendations} label="Ti hanno consigliato" />
      {(shownLive.length > 0 || shown.length > 0) && (
        <div className="space-y-2">
          <p className="px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-2 lg:px-10">
            Stanno guardando
          </p>
          <FriendsWatchingRow items={[...shownLive, ...shown]} live={shownLive} />
        </div>
      )}
    </section>
  );
}
