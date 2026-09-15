import { MAIN_PROVIDER_IDS, providerLogoUrl } from "@/lib/config";
import { orderPlatforms } from "@/lib/platforms/catalog";
import { getPersonalContext } from "@/lib/similar/personal";
import { getProviderList } from "@/lib/tmdb/client";
import { HomeTypeSwap } from "./HomeType";
import { PlatformFilter, type PlatformPill } from "./PlatformFilter";

/**
 * Le pillole "Per piattaforma", subito sotto quelle per genere (richiesta utente
 * 2026-09-15): scegli il servizio che paghi e trovi cosa ci puoi guardare.
 *
 * L'ordine è personale come quello dei generi: davanti le piattaforme che il profilo di
 * gusto (fase A) riconosce come sue — chi guarda su NOW trova NOW per primo — poi le
 * altre nell'ordine del catalogo. Personalizzazione spenta o profilo povero: l'ordine
 * del catalogo, identico per tutti.
 *
 * I loghi arrivano da `watch/providers` (cache 7 giorni, la stessa lettura che serve
 * all'accesso rapido della home): se TMDB non risponde restano le iniziali, non un buco.
 */
export async function HomePlatforms() {
  const [{ vector, attiva }, loghi] = await Promise.all([
    getPersonalContext().catch(() => ({ vector: null, attiva: false })),
    getProviderList()
      .then((list) => new Map(list.map((p) => [p.provider_id, p.logo_path])))
      .catch((error) => {
        console.error("[home] logo provider non disponibili", error);
        return new Map<number, string | null>();
      }),
  ]);

  const entries: PlatformPill[] = orderPlatforms(attiva ? vector : null).map((p) => ({
    key: p.key,
    pillola: p.pillola,
    logo: providerLogoUrl(loghi.get(p.providerId) ?? null),
  }));

  return (
    <HomeTypeSwap
      movie={<PlatformFilter entries={entries} type="movie" />}
      tv={<PlatformFilter entries={entries} type="tv" />}
    />
  );
}

/** Stessa geometria: la scritta su mobile, etichetta e fila di pillole da lg. */
export function HomePlatformsSkeleton() {
  return (
    <div className="pb-5 lg:pb-6">
      <div className="px-5 lg:hidden">
        <div className="mx-auto h-9 w-[148px] rounded-full bg-white/[0.06]" />
      </div>
      <div className="hidden lg:flex lg:items-center lg:justify-center lg:gap-4">
        <div className="h-3 w-[108px] rounded-full bg-white/[0.06]" />
        <span aria-hidden="true" className="h-4 w-px bg-white/10" />
        <div className="flex gap-2 overflow-hidden">
          {MAIN_PROVIDER_IDS.slice(0, 7).map((id) => (
            <div
              key={id}
              className="h-9 w-[104px] shrink-0 rounded-full bg-white/[0.05]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
