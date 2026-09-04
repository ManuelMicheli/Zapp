import Image from "next/image";
import Link from "next/link";
import { PlusOneButton } from "@/components/home/PlusOneButton";
import { backdropUrl } from "@/lib/config";
import type { EntryWithTitle } from "@/lib/watch/queries";

/** Provider principale su cui riprendere la visione. */
export interface ContinueInfo {
  logo: string | null;
  name: string | null;
  url: string | null;
}

const HERO_GRADIENT =
  "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 25%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.9) 82%, #000000 100%)";

const HERO_GLOW =
  "radial-gradient(circle, rgba(139,92,246,0.35) 0%, rgba(139,92,246,0.08) 45%, rgba(0,0,0,0) 70%)";

/** Gradiente e alone viola dell'hero: condivisi con il muro di locandine. */
export function HeroScrim() {
  return (
    <>
      <div className="absolute inset-0" style={{ background: HERO_GRADIENT }} />
      <div
        className="absolute -left-[120px] top-[200px] h-[260px] w-[420px] rounded-full blur-[40px]"
        style={{ background: HERO_GLOW }}
      />
    </>
  );
}

const CTA_CLASS =
  "flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-accent text-base font-semibold text-white shadow-[var(--shadow-accent)]";

/**
 * Hero della home: la prima voce "sto guardando" a tutta larghezza,
 * con backdrop, provider, progresso e le due azioni rapide.
 */
export function HeroWatching({
  entry,
  info,
  progressLabel,
  progressPct,
  isSeries,
}: {
  entry: EntryWithTitle;
  info: ContinueInfo;
  /** "Stagione n, episodio m", solo per le serie. */
  progressLabel: string | null;
  progressPct: number | null;
  isSeries: boolean;
}) {
  const name = entry.title?.title ?? "";
  const backdrop = backdropUrl(entry.title?.backdrop_path ?? null, "original");
  const href = `/title/${entry.media_type}/${entry.title_id}`;

  return (
    <section className="relative h-[420px] lg:h-[520px]">
      <div className="absolute inset-0 overflow-hidden">
        {backdrop && (
          <Image
            src={backdrop}
            alt=""
            fill
            priority
            quality={95}
            sizes="(min-width: 1024px) calc(100vw - 240px), 100vw"
            className="origin-[50%_30%] scale-[1.12] object-cover"
          />
        )}
        <HeroScrim />
      </div>

      {/* mobile: larghezza fluida entro 350px, così sotto i 370px non si scrolla in orizzontale */}
      <div className="absolute left-5 right-5 top-[232px] flex w-auto max-w-[350px] flex-col gap-3 lg:inset-x-0 lg:bottom-14 lg:top-auto lg:w-full lg:max-w-[720px] lg:px-10">
        <p className="text-[13px] font-medium text-accent-soft">Continua a guardare</p>
        <Link href={href}>
          <h1 className="text-[40px] font-bold leading-none tracking-[-0.045em] text-text lg:text-[56px]">
            {name}
          </h1>
        </Link>

        {(info.name || progressLabel) && (
          <div className="flex flex-wrap items-center gap-2.5">
            {info.name && (
              <span className="glass flex items-center gap-2 rounded-full py-[5px] pl-[5px] pr-2.5">
                {info.logo && (
                  <Image
                    src={info.logo}
                    alt=""
                    width={22}
                    height={22}
                    className="size-[22px] rounded-md border border-black/50"
                  />
                )}
                <span className="text-xs font-medium">{info.name}</span>
              </span>
            )}
            {progressLabel && (
              <span className="text-[13px] text-white/70">{progressLabel}</span>
            )}
          </div>
        )}

        {progressPct != null && (
          <div className="h-1 overflow-hidden rounded-full bg-white/[0.14]">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.round(progressPct * 100)}%` }}
            />
          </div>
        )}

        <div className="mt-1 flex gap-2.5">
          {info.url ? (
            <a href={info.url} target="_blank" rel="noopener" className={CTA_CLASS}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
              </svg>
              <span>Continua</span>
            </a>
          ) : (
            <Link href={href} className={CTA_CLASS}>
              Apri scheda
            </Link>
          )}
          {isSeries && (
            <PlusOneButton
              titleId={entry.title_id}
              className="glass h-[52px] w-[84px] rounded-full text-[15px] font-semibold"
            />
          )}
        </div>
      </div>
    </section>
  );
}
