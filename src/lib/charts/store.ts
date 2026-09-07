import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { computeMomentum } from "./momentum";
import { resolveChartTitle } from "./resolve";

export interface ChartInput {
  source: "netflix_tudum" | "justwatch" | "tmdb";
  providerId: number;
  mediaType: "movie" | "tv";
  /** `YYYY-MM-DD`. */
  period: string;
  rank: number;
  rawTitle: string;
  rawSeason: string | null;
  weeksInChart: number | null;
  /**
   * Id TMDB già noto: JustWatch lo restituisce insieme al titolo, quindi quelle righe
   * nascono risolte e saltano `resolvePending`. Netflix non lo dà: lì resta `null`.
   * Chi lo passa deve **prima** aver messo il titolo in cache con `getOrFetchTitle`,
   * altrimenti la chiave esterna lo rifiuta.
   */
  titleId?: number | null;
}

/**
 * Scrive un periodo di classifica calcolando il momentum sul periodo precedente
 * della stessa (fonte, provider, tipo). Le righe già presenti vengono aggiornate:
 * rilanciare il job due volte non crea doppioni (vincolo unico in migration 0020).
 */
export async function saveChart(rows: ChartInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = createServiceClient();
  const { source, providerId, mediaType, period } = rows[0];

  // Posizioni del periodo precedente, per titolo grezzo
  const { data: previous } = await supabase
    .from("title_charts")
    .select("rank, raw_title, period")
    .eq("source", source)
    .eq("provider_id", providerId)
    .eq("media_type", mediaType)
    .lt("period", period)
    .order("period", { ascending: false })
    .limit(50);

  const lastPeriod = previous?.[0]?.period ?? null;
  const previousRank = new Map<string, number>();
  for (const p of previous ?? []) {
    if (p.period === lastPeriod) previousRank.set(p.raw_title, p.rank);
  }

  const payload = rows.map((r) => ({
    source: r.source,
    provider_id: r.providerId,
    country: "IT",
    media_type: r.mediaType,
    period: r.period,
    rank: r.rank,
    raw_title: r.rawTitle,
    raw_season: r.rawSeason,
    weeks_in_chart: r.weeksInChart,
    momentum: computeMomentum(previousRank.get(r.rawTitle) ?? null, r.rank),
    title_id: r.titleId ?? null,
    resolved_at: r.titleId ? new Date().toISOString() : null,
  }));

  const { error } = await supabase.from("title_charts").upsert(payload, {
    onConflict: "source,provider_id,country,media_type,period,rank",
  });
  if (error) {
    console.error("[charts] upsert fallito:", error.message);
    return 0;
  }
  return payload.length;
}

/**
 * Assegna un id TMDB alle righe che non ce l'hanno ancora. Cinque tentativi per riga,
 * poi si lascia stare: la riga resta in tabella col suo `raw_title`, così la classifica
 * si può ispezionare anche dove il match non c'è.
 */
export async function resolvePending(limit: number): Promise<number> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("title_charts")
    .select("id, media_type, raw_title, resolve_tries")
    .is("title_id", null)
    .lt("resolve_tries", 5)
    .order("period", { ascending: false })
    .limit(limit);

  let resolved = 0;
  for (const row of data ?? []) {
    const id = await resolveChartTitle(row.raw_title, row.media_type);
    if (id === null) {
      await supabase
        .from("title_charts")
        .update({ resolve_tries: row.resolve_tries + 1 })
        .eq("id", row.id);
      continue;
    }
    // Tutte le righe con lo stesso titolo grezzo puntano allo stesso titolo: una
    // update sola le sistema tutte, comprese le settimane precedenti
    await supabase
      .from("title_charts")
      .update({ title_id: id, resolved_at: new Date().toISOString() })
      .eq("raw_title", row.raw_title)
      .eq("media_type", row.media_type)
      .is("title_id", null);
    resolved += 1;
  }
  return resolved;
}
