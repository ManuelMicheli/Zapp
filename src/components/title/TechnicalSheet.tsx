import type { Tables } from "@/types/database";
import { fattiTecnici, type TitleRaw } from "@/lib/tmdb/facts";

/**
 * Scheda tecnica: lingua, paese, produzione, durata, incassi, età. Sono i dati che
 * non stanno sotto la trama (`TitleAbout`), così nessuno compare due volte.
 * Chiude con l'attribuzione TMDB, che prima stava nella riga del voto.
 */
export function TechnicalSheet({ title }: { title: Tables<"titles"> }) {
  const raw = title.raw as unknown as TitleRaw;
  const fatti = fattiTecnici(raw, title.media_type, title.runtime ?? null);
  if (fatti.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 px-5 md:px-0">
      <h2 className="text-xl font-bold tracking-[-0.03em]">Scheda tecnica</h2>
      <dl className="flex flex-col gap-2.5 rounded-[20px] border border-border bg-surface p-4">
        {fatti.map((f, i) => (
          <div
            key={f.label}
            className={`flex items-baseline gap-4 ${i > 0 ? "border-t border-border pt-2.5" : ""}`}
          >
            <dt className="w-32 shrink-0 text-xs text-muted-2">{f.label}</dt>
            <dd className="flex-1 text-right text-[13px] font-medium">{f.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[10px] text-muted-2">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </section>
  );
}
