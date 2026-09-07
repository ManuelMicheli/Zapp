import type { Tables } from "@/types/database";
import { fattiTrama, taglineOf, type TitleRaw } from "@/lib/tmdb/facts";
import { Overview } from "./Overview";

/**
 * Trama della scheda titolo: la tagline apre come in una pagina di rivista, poi il
 * testo, il voto TMDB e i quattro dati che dicono chi l'ha fatto e quando è uscito.
 * Il resto dei dati sta in `TechnicalSheet`: mai gli stessi due volte (scelta utente
 * 2026-09-07, mockup "Trama B").
 */
export function TitleAbout({ title }: { title: Tables<"titles"> }) {
  const raw = title.raw as unknown as TitleRaw;
  const tagline = taglineOf(raw);
  const fatti = fattiTrama(
    raw,
    title.media_type,
    title.title,
    title.release_date ?? null,
  );
  const voto = title.vote_average;
  const voti = title.vote_count;

  if (!title.overview && fatti.length === 0) return null;

  return (
    <section className="flex flex-col gap-4 px-5 md:px-0">
      {tagline ? (
        <p className="text-pretty text-[22px] font-light leading-[1.2] tracking-[-0.03em] lg:text-[26px]">
          {tagline}
        </p>
      ) : (
        <h2 className="text-xl font-bold tracking-[-0.03em]">Trama</h2>
      )}
      <div className="h-0.5 w-11 bg-accent" />

      {title.overview && (
        <Overview text={title.overview} className="" size={16} heading={false} />
      )}

      {voto != null && voto > 0 && (
        <>
          <div className="h-px bg-border" />
          <div className="flex items-baseline gap-2">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="#facc15"
              aria-hidden="true"
              className="self-center"
            >
              <path d="M12 2l2.94 6.26 6.87.86-5.06 4.73 1.3 6.79L12 17.27l-6.05 3.37 1.3-6.79L2.19 9.12l6.87-.86L12 2z" />
            </svg>
            <b className="text-xl font-bold tracking-[-0.03em]">
              {voto.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
            </b>
            <span className="text-xs text-muted">
              /10
              {voti != null && voti > 0
                ? ` · ${voti.toLocaleString("it-IT")} voti TMDB`
                : " TMDB"}
            </span>
          </div>
        </>
      )}

      {fatti.length > 0 && (
        <>
          <div className="h-px bg-border" />
          <dl className="grid grid-cols-2 gap-4">
            {fatti.map((f) => (
              <div key={f.label} className="flex flex-col gap-[3px]">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-2">
                  {f.label}
                </dt>
                <dd className="text-[13px] font-medium leading-[1.35] text-white/[0.92]">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
