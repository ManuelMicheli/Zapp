import { NextResponse } from "next/server";
import { resolveProviderLink } from "@/lib/links/resolve";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { isSafeExternalUrl } from "@/lib/validate";
import { createClient } from "@/lib/supabase/server";
import { disneyPlaybackHref } from "@/lib/links/playback";
import { nativeOpen } from "@/lib/links/native-app";

export const dynamic = "force-dynamic";

/**
 * Redirect alla pagina esatta del titolo su una piattaforma.
 * Usato dove il link non è ancora in cache (home, libreria): risolve al volo
 * e manda l'utente direttamente sulla scheda del film/serie, mai sulla ricerca
 * se esiste un link diretto.
 */
export async function GET(
  req: Request,
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

  const wantsPlay = new URL(req.url).searchParams.get("play") === "1";
  const destination = wantsPlay ? disneyPlaybackHref(link.url, Number(providerId)) : link.url;
  // Dopo /go il client non conosceva il dominio: completiamo qui anche il
  // passaggio Android all'app, esclusivamente sul link Disney convertito.
  const target =
    wantsPlay && destination !== link.url
      ? nativeOpen({
          url: destination,
          providerId: Number(providerId),
          ua: req.headers.get("user-agent") ?? "",
        }).href
      : destination;
  return NextResponse.redirect(target, { status: 302 });
}
