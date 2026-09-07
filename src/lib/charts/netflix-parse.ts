/**
 * Il Top 10 ufficiale di Netflix, paese per paese.
 * Colonne del file `all-weeks-countries.tsv`:
 * country_name, country_iso2, week, category, weekly_rank, show_title, season_title,
 * cumulative_weeks_in_top_10.
 */
export interface TudumRow {
  countryIso2: string;
  /** Domenica della settimana, `YYYY-MM-DD`. */
  week: string;
  category: "Films" | "TV";
  rank: number;
  showTitle: string;
  /** `null` dove il file scrive `N/A` o lascia vuoto. */
  seasonTitle: string | null;
  weeksInTop10: number | null;
}

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Una riga del TSV, o `null` se è l'intestazione o è rotta. */
export function parseTudumRow(line: string): TudumRow | null {
  if (!line) return null;
  const cells = line.replace(/\r$/, "").split("\t");
  if (cells.length < 7) return null;

  const [, countryIso2, week, category, rankText, showTitle, seasonTitle, weeksText] =
    cells;

  if (!WEEK_RE.test(week)) return null; // intestazione compresa
  if (category !== "Films" && category !== "TV") return null;
  const rank = Number(rankText);
  if (!Number.isInteger(rank) || rank < 1) return null;
  if (!showTitle) return null;

  const weeks = Number(weeksText);
  return {
    countryIso2,
    week,
    category,
    rank,
    showTitle,
    seasonTitle: seasonTitle && seasonTitle !== "N/A" ? seasonTitle : null,
    weeksInTop10: Number.isInteger(weeks) && weeks > 0 ? weeks : null,
  };
}

/** La settimana più recente fra quelle passate. */
export function latestWeek(rows: TudumRow[]): string | null {
  let best: string | null = null;
  for (const r of rows) if (best === null || r.week > best) best = r.week;
  return best;
}
