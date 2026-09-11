/** Il Play usa l'episodio mostrato nella card. Gli altri provider restano invariati. */
export function playbackHref(
  mediaType: "movie" | "tv",
  titleId: number,
  providerId: number | null,
  season: number | null,
  episode: number | null,
  fallback: string | null,
): string | null {
  if (providerId == null || ![8, 39, 119, 337].includes(providerId)) return fallback;
  const base = `/play/${mediaType}/${titleId}/${providerId}`;
  if (mediaType === "movie") return base;
  if (!season || !episode)
    return providerId === 337 && fallback ? disneyPlaybackHref(fallback, providerId) : fallback;
  return `${base}?season=${season}&episode=${episode}`;
}

export interface PlaybackOffer {
  deeplinkURL?: string | null;
  standardWebURL?: string | null;
  monetizationType?: string | null;
  package: { packageId: number } | null;
}

/** Solo link player provati: mai trasformare l'id della serie nell'id episodio. */
function canonicalPlayerUrl(raw: string, providerId: number): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    if (providerId === 8 && u.hostname === "www.netflix.com") {
      const id = u.pathname.match(/^\/watch\/(\d{1,12})\/?$/)?.[1];
      return id ? `https://www.netflix.com/watch/${id}` : null;
    }
    if (
      providerId === 119 &&
      u.hostname === "app.primevideo.com" &&
      u.pathname === "/watch"
    ) {
      const gti = u.searchParams.get("gti");
      if (!gti || !/^amzn1\.dv\.gti\.[a-z0-9-]{10,100}$/i.test(gti)) return null;
      // Il dispatcher ufficiale sceglie app o web; su desktop aggiunge autoplay=1.
      return `https://app.primevideo.com/watch?gti=${encodeURIComponent(gti)}`;
    }
    if (providerId === 337 && u.hostname === "www.disneyplus.com") {
      const uuid = u.pathname.match(
        /^(?:\/it-it)?\/play\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i,
      )?.[1];
      return uuid ? `https://www.disneyplus.com/it-it/play/${uuid}` : null;
    }
    if (providerId === 39 && u.hostname === "www.nowtv.it") {
      const path = u.pathname.replace(/\/$/, "");
      const breve = /^\/watch\/asset\/[a-z0-9-]+\/R_\d+_HD$/i.test(path);
      const episodio =
        /^\/watch\/home\/asset\/[a-z0-9-]+\/[a-z0-9-]+\/seasons\/\d+\/episodes\/[a-z0-9-]+\/R_\d+_HD$/i.test(
          path,
        );
      return breve || episodio ? `https://www.nowtv.it${path}` : null;
    }
  } catch {
    /* Dato esterno malformato: non e' una destinazione utilizzabile. */
  }
  return null;
}

export function pickPlaybackUrl(
  offers: PlaybackOffer[],
  providerId: number,
): string | null {
  const order: Record<string, number> = { FLATRATE: 0, FREE: 1, ADS: 2, RENT: 3, BUY: 4 };
  const sorted = offers
    .filter((o) => o.package?.packageId === providerId)
    .sort(
      (a, b) =>
        (order[a.monetizationType ?? ""] ?? 5) - (order[b.monetizationType ?? ""] ?? 5),
    );
  for (const offer of sorted) {
    const url = offer.deeplinkURL && canonicalPlayerUrl(offer.deeplinkURL, providerId);
    if (url) return url;
  }
  return null;
}

/** Compatibilita con i link Disney gia distribuiti prima del resolver episodio. */
export function disneyPlaybackHref(
  url: string,
  providerId: number | null | undefined,
): string {
  if (providerId !== 337) return url;
  if (/^\/go\/(movie|tv)\/\d{1,10}\/337$/.test(url)) return `${url}?play=1`;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (
    parsed.protocol !== "https:" ||
    !["disneyplus.com", "www.disneyplus.com"].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.port
  )
    return url;
  const match = parsed.pathname.match(
    /^(\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?)(?:browse\/entity-)([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})\/?$/i,
  );
  if (!match) return url;
  parsed.pathname = `${match[1]}play/${match[2]}`;
  return parsed.toString();
}
