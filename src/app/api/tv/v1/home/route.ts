import type { NextRequest } from "next/server";
import { getHomeData } from "@/lib/watch/queries";
import { getContinueItems } from "@/lib/watch/continue";
import { getLiveSessions } from "@/lib/watch/live";
import { getWatchedPlatforms } from "@/lib/watch/platforms";
import { getHomeHero } from "@/lib/home/hero";
import { SHELF_PROVIDER_IDS } from "@/lib/home/shelves";
import { pickBecauseSources } from "@/lib/home/shelves-rank";
import { getHomeRails } from "@/lib/rank/engine";
import { MASSA_MINIMA } from "@/lib/rank/vector";
import { getTasteProfile } from "@/lib/taste/queries";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import { continueFromItem, heroFromItem } from "@/lib/tv/map";
import { buildShelfManifest, type ManifestRail } from "@/lib/tv/manifest";

/**
 * La home in una risposta: "Continua a guardare" e il carosello gia' pieni (sono
 * sopra la piega), gli scaffali come **manifesto** (chiave e titolo) che la TV
 * riempie uno alla volta con `/home/shelf/{key}` scorrendo. La home web fa lo
 * stesso con i `Suspense`: nessuna funzione Vercel aspetta venti liste.
 */
export async function GET(request: NextRequest) {
  return withBearer(request, async (ctx) => {
    const [homeData, hero, profilo, railsFilm, railsSerie] = await Promise.all([
      getHomeData(),
      getHomeHero().catch(() => ({ all: [] })),
      getTasteProfile(ctx.userId).catch(() => null),
      getHomeRails("movie").catch(() => []),
      getHomeRails("tv").catch(() => []),
    ]);

    const [live, platforms] = await Promise.all([
      getLiveSessions().catch(() => []),
      getWatchedPlatforms(homeData.watching).catch(() => []),
    ]);
    const items = await getContinueItems(homeData.watching, live, platforms).catch(
      () => [],
    );
    const perEntry = new Map(homeData.watching.map((e) => [String(e.id), e]));
    const liveIds = new Set(live.map((s) => `${s.mediaType}:${s.titleId}`));

    // Le rail esistono per film e per serie con la stessa chiave: nel manifesto una
    // volta sola, `/home/shelf/{key}` le mescola come fa `PersonalRails`. `buildRails`
    // (src/lib/rank/rails.ts) genera solo queste tre dimensioni fra le sette di
    // `Dimensione`: la guardia sotto lo dice anche al tipo, non solo a runtime.
    const DIMENSIONI_MANIFESTO = new Set(["persone", "generi", "decenni"]);
    const viste = new Set<string>();
    const rails: ManifestRail[] = [];
    for (const r of [...railsFilm, ...railsSerie]) {
      if (viste.has(r.key)) continue;
      viste.add(r.key);
      if (!DIMENSIONI_MANIFESTO.has(r.dimensione)) continue;
      rails.push({
        key: r.key,
        titolo: r.titolo,
        dimensione: r.dimensione as ManifestRail["dimensione"],
      });
    }

    return tvJson({
      continue: items.map((c) =>
        continueFromItem(
          c,
          perEntry.get(c.entryId),
          liveIds.has(`${c.mediaType}:${c.titleId}`),
        ),
      ),
      hero: hero.all.map(heroFromItem),
      shelves: buildShelfManifest({
        profiloRicco: (profilo?.massa ?? 0) >= MASSA_MINIMA,
        rails,
        because: pickBecauseSources(homeData.watched, "all"),
        hasWant: homeData.want.length > 0,
        platformIds: [...SHELF_PROVIDER_IDS],
      }),
    });
  });
}

export const dynamic = "force-dynamic";
