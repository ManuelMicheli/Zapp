/**
 * Link "Continua/Apri" verso una piattaforma a partire dalle righe già in cache.
 * Se in `title_provider_links` c'è un link diretto lo usa; altrimenti passa da
 * `/go/...`, che risolve al volo e reindirizza alla pagina esatta del titolo.
 * Condiviso da server e client (nessun import server-only).
 */
export function goUrl(
  mediaType: "movie" | "tv",
  titleId: number,
  providerId: number,
): string {
  return `/go/${mediaType}/${titleId}/${providerId}`;
}

export function providerHref(
  mediaType: "movie" | "tv",
  titleId: number,
  providerId: number,
  links: { provider_id: number; url: string; source: string }[],
): string {
  const row = links.find((l) => l.provider_id === providerId);
  if (row && row.source !== "search") return row.url;
  return goUrl(mediaType, titleId, providerId);
}
