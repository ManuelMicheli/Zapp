import { HOME_SCOPE_VUOTO, scopeVuoto, type HomeScope } from "@/lib/home/scope";
import { chiaviNelloScope } from "@/lib/home/scope-filter";
import { getFriendsWatchingHome, type HomeRecommendation } from "@/lib/social/queries";
import { createClient } from "@/lib/supabase/server";
import { getFriendsLive } from "@/lib/watch/social-live";
import { FriendsLiveContent } from "./FriendsLiveContent";

export async function FriendsSection({
  recommendations,
  scope = HOME_SCOPE_VUOTO,
}: {
  recommendations: HomeRecommendation[];
  scope?: HomeScope;
}) {
  const [watching, initialLive] = await Promise.all([
    getFriendsWatchingHome(),
    getFriendsLive().catch(() => []),
  ]);

  // Nella home filtrata restano consigli e visioni degli amici che stanno nell'ambito:
  // una query sola per le tre liste, sui titoli in cache.
  let recs = recommendations;
  let shown = watching;
  let live = initialLive;
  if (!scopeVuoto(scope)) {
    const db = await createClient();
    const dentro = await chiaviNelloScope(
      db,
      [
        ...recommendations.map((r) => ({ id: r.titleId, mediaType: r.mediaType })),
        ...watching.map((w) => ({ id: w.titleId, mediaType: w.mediaType })),
        ...initialLive.map((l) => ({ id: l.titleId, mediaType: l.mediaType })),
      ],
      scope,
    );
    recs = recommendations.filter((r) => dentro.has(`${r.mediaType}-${r.titleId}`));
    shown = watching.filter((w) => dentro.has(`${w.mediaType}-${w.titleId}`));
    live = initialLive.filter((l) => dentro.has(`${l.mediaType}-${l.titleId}`));
  }

  return (
    <FriendsLiveContent
      recommendations={recs}
      watching={shown}
      initialLive={live}
      renderedAt={Date.now()}
    />
  );
}
