/** Uguaglianza conservativa: niente prefissi, articoli rimossi o fuzzy matching. */
export function samePrimeName(a: string, b: string): boolean {
  const clean = (s: string) =>
    s
      .normalize("NFKC")
      .toLocaleLowerCase("it")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  return !!clean(a) && clean(a) === clean(b);
}

type Season = {
  episodes: { season_number: number; episode_number: number; name: string }[];
};

/** I numeri Prime non sono numeri TMDB: accetta solo un nome unico su tutte le stagioni. */
export async function resolvePrimeEpisode(
  episodeName: string | null,
  summaries: unknown,
  loadSeason: (season: number) => Promise<Season>,
): Promise<{ season: number; episode: number } | null> {
  if (!episodeName || !Array.isArray(summaries)) return null;
  const seasons = [
    ...new Set(
      summaries.flatMap((v) =>
        v &&
        typeof v === "object" &&
        Number.isInteger(v.season_number) &&
        v.season_number > 0
          ? [v.season_number as number]
          : [],
      ),
    ),
  ];
  // Mai scegliere su un sottoinsieme: un'altra stagione potrebbe essere ambigua.
  if (!seasons.length || seasons.length > 20) return null;
  const matches: { season: number; episode: number }[] = [];
  for (let i = 0; i < seasons.length; i += 3) {
    const rows = await Promise.all(seasons.slice(i, i + 3).map(loadSeason));
    for (const row of rows)
      for (const episode of row.episodes) {
        if (
          samePrimeName(episodeName, episode.name) &&
          Number.isInteger(episode.episode_number) &&
          episode.episode_number > 0 &&
          seasons.includes(episode.season_number)
        ) {
          matches.push({
            season: episode.season_number,
            episode: episode.episode_number,
          });
        }
      }
  }
  return matches.length === 1 ? matches[0] : null;
}
