import { getFriendsWatchingHome, type HomeRecommendation } from "@/lib/social/queries";
import type { FriendWatchingItem } from "@/lib/social/queries";
import { HomeTypeGate, type HomeTab } from "./HomeType";
import { FriendsWatchingRow } from "./FriendsWatchingRow";
import { RecommendationsSection } from "./RecommendationsSection";

const SUB_LABEL =
  "px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-2 lg:px-10";

/** La fila "Stanno guardando" di una scheda: senza titoli non lascia l'etichetta orfana. */
function WatchingBlock({ items }: { items: FriendWatchingItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className={SUB_LABEL}>Stanno guardando</p>
      <FriendsWatchingRow items={items} />
    </div>
  );
}

/**
 * Una sola sezione per gli amici: cosa ti hanno consigliato (con "Voglio vederlo"
 * accanto) e cosa stanno guardando adesso. Prima erano due scaffali distinti in due
 * punti della home.
 * La sezione si vede solo nelle schede dove ha qualcosa: sotto "Serie TV", con soli
 * consigli di film, sparisce del tutto invece di lasciare un titolo orfano.
 */
export async function FriendsSection({
  recommendations,
}: {
  recommendations: HomeRecommendation[];
}) {
  const watching = await getFriendsWatchingHome();
  const has = (type: "movie" | "tv") =>
    recommendations.some((r) => r.mediaType === type) ||
    watching.some((w) => w.mediaType === type);
  const tabs: HomeTab[] = [];
  if (recommendations.length > 0 || watching.length > 0) tabs.push("all");
  if (has("movie")) tabs.push("movie");
  if (has("tv")) tabs.push("tv");
  if (tabs.length === 0) return null;

  return (
    <HomeTypeGate type={tabs}>
      <section className="space-y-4">
        <h2 className="px-5 text-xl font-bold tracking-[-0.03em] lg:px-10">
          I tuoi amici
        </h2>

        <RecommendationsSection items={recommendations} label="Ti hanno consigliato" />

        <HomeTypeGate type="all">
          <WatchingBlock items={watching} />
        </HomeTypeGate>
        <HomeTypeGate type="movie">
          <WatchingBlock items={watching.filter((w) => w.mediaType === "movie")} />
        </HomeTypeGate>
        <HomeTypeGate type="tv">
          <WatchingBlock items={watching.filter((w) => w.mediaType === "tv")} />
        </HomeTypeGate>
      </section>
    </HomeTypeGate>
  );
}
