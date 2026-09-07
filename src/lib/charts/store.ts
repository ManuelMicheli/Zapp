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
 * Scrive uno o più periodi di classifica. Le righe vengono raggruppate per
 * (fonte, provider, tipo, periodo) e ogni gruppo calcola il proprio momentum sul
 * periodo precedente: così chi chiama può passare tutto insieme senza doversi
 * ricordare di dividere film e serie, e un array misto non produce più un momentum
 * calcolato sulla classifica sbagliata.
 */
export async function saveChart(rows: ChartInput[]): Promise<number> {
  const gruppi = new Map<string, ChartInput[]>();
  for (const r of rows) {
    const chiave = `${r.source}|${r.providerId}|${r.mediaType}|${r.period}`;
    const g = gruppi.get(chiave);
    if (g) g.push(r);
    else gruppi.set(chiave, [r]);
  }
  let scritte = 0;
  for (const gruppo of gruppi.values()) scritte += await saveChartGroup(gruppo);
  return scritte;
}

/**
 * Scrive un singolo periodo di classifica (fonte, provider, tipo, periodo omogenei)
 * calcolando il momentum sul periodo precedente. Le righe già presenti vengono
 * aggiornate: rilanciare il job due volte non crea doppioni (vincolo unico in
 * migration 0020).
 */
async function saveChartGroup(rows: ChartInput[]): Promise<number> {
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

  const fatti = new Set<string>();
  let resolved = 0;
  for (const row of data ?? []) {
    // La risoluzione aggiorna tutte le righe con lo stesso titolo: non ripeterla
    const chiave = `${row.media_type}-${row.raw_title}`;
    if (fatti.has(chiave)) continue;
    fatti.add(chiave);

    const id = await resolveChartTitle(row.raw_title, row.media_type);
    if (id === null) {
      const { error } = await supabase
        .from("title_charts")
        .update({ resolve_tries: row.resolve_tries + 1 })
        .eq("id", row.id);
      // Senza questo controllo un errore muto lascerebbe il contatore fermo e la riga
      // tornerebbe in coda per sempre
      if (error) {
        console.error(`[charts] tentativo non registrato su ${row.id}:`, error.message);
      }
      continue;
    }
    // Tutte le righe con lo stesso titolo grezzo puntano allo stesso titolo: una
    // update sola le sistema tutte, comprese le settimane precedenti
    const { error } = await supabase
      .from("title_charts")
      .update({ title_id: id, resolved_at: new Date().toISOString() })
      .eq("raw_title", row.raw_title)
      .eq("media_type", row.media_type)
      .is("title_id", null);
    if (error) {
      console.error(
        `[charts] risoluzione non scritta per "${row.raw_title}":`,
        error.message,
      );
      continue;
    }
    resolved += 1;
  }
  return resolved;
}
