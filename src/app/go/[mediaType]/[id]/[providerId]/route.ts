import { NextResponse } from "next/server";
import { resolveProviderLink } from "@/lib/links/resolve";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { isSafeExternalUrl } from "@/lib/validate";
import { createClient } from "@/lib/supabase/server";

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
  // La rotta risolve al volo (una chiamata a JustWatch/Wikidata per titolo
  // mancante): senza sessione resterebbe un modo per farla lavorare da fuori.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not found", { status: 404 });

  const { mediaType, id, providerId } = await ctx.params;
  if (
    (mediaType !== "movie" && mediaType !== "tv") ||
    !/^\d{1,10}$/.test(id) ||
    !/^\d{1,10}$/.test(providerId)
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const cached = await getOrFetchTitle(Number(id), mediaType);
  if (!cached) return new NextResponse("Not found", { status: 404 });

  const link = await resolveProviderLink(cached.title, Number(providerId));
  // L'ultimo controllo prima di mandare il browser fuori: i link `justwatch`
  // arrivano da terzi, quindi si accetta solo https verso un dominio pubblico.
  // Non si fissa il dominio della piattaforma: l'offerta Prime Video, per dirne
  // una, sta legittimamente su amazon.it e non su primevideo.com.
  if (!link || !isSafeExternalUrl(link.url)) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.redirect(link.url, { status: 302 });
}
