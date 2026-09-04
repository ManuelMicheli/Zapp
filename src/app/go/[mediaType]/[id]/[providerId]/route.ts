import { NextResponse } from "next/server";
import { resolveProviderLink } from "@/lib/links/resolve";
import { getOrFetchTitle } from "@/lib/tmdb/cache";

export const dynamic = "force-dynamic";

/**
 * Redirect alla pagina esatta del titolo su una piattaforma.
 * Usato dove il link non è ancora in cache (home, libreria): risolve al volo
 * e manda l'utente direttamente sulla scheda del film/serie, mai sulla ricerca
 * se esiste un link diretto.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ mediaType: string; id: string; providerId: string }> },
) {
  const { mediaType, id, providerId } = await ctx.params;
  if (
    (mediaType !== "movie" && mediaType !== "tv") ||
    !/^\d+$/.test(id) ||
    !/^\d+$/.test(providerId)
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const cached = await getOrFetchTitle(Number(id), mediaType);
  if (!cached) return new NextResponse("Not found", { status: 404 });

  const link = await resolveProviderLink(cached.title, Number(providerId));
  if (!link) return new NextResponse("Not found", { status: 404 });

  return NextResponse.redirect(link.url, { status: 302 });
}
