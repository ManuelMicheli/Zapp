import { getFriendsWatchingHome, type HomeRecommendation } from "@/lib/social/queries";
import { getFriendsLive } from "@/lib/watch/social-live";
import { FriendsLiveContent } from "./FriendsLiveContent";

export async function FriendsSection({
  recommendations,
}: {
  recommendations: HomeRecommendation[];
}) {
  const [watching, initialLive] = await Promise.all([
    getFriendsWatchingHome(),
    getFriendsLive().catch(() => []),
  ]);
  return (
    <FriendsLiveContent
      recommendations={recommendations}
      watching={watching}
      initialLive={initialLive}
      renderedAt={Date.now()}
    />
  );
}
