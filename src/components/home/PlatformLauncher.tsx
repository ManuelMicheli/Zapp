import Image from "next/image";
import { MAIN_PROVIDER_IDS, PROVIDERS, providerLogoUrl } from "@/lib/config";
import { getProviderList } from "@/lib/tmdb/client";

interface Platform {
  id: number;
  name: string;
  homeUrl: string;
  logo: string | null;
}

/** Etichette brevi per le tessere (il nome completo resta in PROVIDERS). */
const SHORT_LABEL: Record<number, string> = { 359: "Infinity" };

/** Piattaforme principali IT con logo TMDB; senza TMDB restano nome e iniziale. */
async function loadPlatforms(): Promise<Platform[]> {
  let logos = new Map<number, string | null>();
  try {
    const list = await getProviderList();
    logos = new Map(list.map((p) => [p.provider_id, p.logo_path]));
  } catch (error) {
    console.error("[home] logo provider non disponibili", error);
  }
  return MAIN_PROVIDER_IDS.map((id) => {
    const config = PROVIDERS[id];
    return {
      id,
      name: SHORT_LABEL[id] ?? config.name,
      homeUrl: config.homeUrl,
      logo: providerLogoUrl(logos.get(id) ?? null),
    };
  });
}

/**
 * Accesso rapido alle piattaforme streaming: una fila di tessere in vetro con il logo,
 * ognuna apre la home della piattaforma in una nuova scheda.
 */
export async function PlatformLauncher({ className = "" }: { className?: string }) {
  const platforms = await loadPlatforms();
  return (
    <ul
      className={`scrollbar-none -mx-5 flex gap-3 overflow-x-auto px-5 md:mx-auto md:max-w-[440px] md:flex-wrap md:justify-center md:overflow-visible md:px-0 lg:max-w-none ${className}`}
    >
      {platforms.map((p) => (
        <li key={p.id} className="shrink-0">
          <a
            href={p.homeUrl}
            target="_blank"
            rel="noopener"
            className="group flex w-[76px] flex-col items-center gap-2"
          >
            <span className="glass flex size-[64px] items-center justify-center overflow-hidden rounded-[20px] transition-transform group-hover:scale-[1.04] group-active:scale-95">
              {p.logo ? (
                <Image
                  src={p.logo}
                  alt=""
                  width={64}
                  height={64}
                  className="size-full object-cover"
                />
              ) : (
                <span className="text-xl font-bold text-text">{p.name[0]}</span>
              )}
            </span>
            <span className="w-full truncate text-center text-[11px] font-medium text-muted group-hover:text-text">
              {p.name}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
