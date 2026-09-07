import { NextResponse } from "next/server";
import { backdropUrl, providerLogoUrl } from "@/lib/config";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import type { TmdbVideos } from "@/lib/tmdb/types";
import { getOfficialTrailers } from "@/lib/trailers/official";
import type { TrailerFrame } from "@/lib/trailers/frame-bars";

/** Un genere come lo salva TMDB dentro `titles.genres`. */
interface StoredGenre {
  id?: number;
  name?: string;
}

export interface PreviewPayload {
  href: string;
  title: string;
  year: string | null;
  /** Voto TMDB su 10, arrotondato a un decimale. */
  vote: number | null;
  /** "1h 52m" per i film, "3 stagioni" per le serie; `null` se il dato manca. */
  meta: string | null;
  genres: string[];
  overview: string | null;
  backdrop: string | null;
  providers: { id: number; name: string; logo: string | null }[];
  trailer: { key: string; frame: TrailerFrame } | null;
}

/**
 * Dati dell'anteprima che si apre passando il mouse su una copertina in home.
 * Chiamata **su intenzione** (mezzo secondo di permanenza), mai per ogni riga di una
 * lista: `getOrFetchTitle` è la fetch della scheda titolo e qui scalda la sua cache,
 * così il click che di solito segue apre la pagina senza attese.
 * `getOfficialTrailers` è DB-first: a regime è una sola lettura di `title_trailers`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaType: string; id: string }> },
) {
  const { mediaType, id: rawId } = await params;
  if (mediaType !== "movie" && mediaType !== "tv") {
    return NextResponse.json({ error: "media_type non valido" }, { status: 400 });
  }
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id non valido" }, { status: 400 });
  }

  const cached = await getOrFetchTitle(id, mediaType);
  if (!cached) {
    return NextResponse.json({ error: "titolo non trovato" }, { status: 404 });
  }
  const { title, providers } = cached;

  const trailers = await getOfficialTrailers({
    videos: (title.raw as { videos?: TmdbVideos } | null)?.videos,
    titleId: title.id,
    mediaType: title.media_type,
    name: title.title,
    releaseDate: title.release_date,
  });

  const seen = new Set<number>();
  const payload: PreviewPayload = {
    href: `/title/${title.media_type}/${title.id}`,
    title: title.title,
    year: title.release_date ? title.release_date.slice(0, 4) : null,
    vote: title.vote_average ? Math.round(title.vote_average * 10) / 10 : null,
    meta: metaLine(title.media_type, title.runtime, title.number_of_seasons),
    genres: ((title.genres as StoredGenre[] | null) ?? [])
      .map((g) => g?.name)
      .filter((name): name is string => Boolean(name))
      .slice(0, 3),
    overview: title.overview,
    backdrop: backdropUrl(title.backdrop_path, "w780"),
    providers: providers
      .filter((p) => p.kind === "flatrate")
      .filter((p) => (seen.has(p.provider_id) ? false : (seen.add(p.provider_id), true)))
      .slice(0, 4)
      .map((p) => ({
        id: p.provider_id,
        name: p.provider_name,
        logo: providerLogoUrl(p.logo_path),
      })),
    trailer: trailers[0] ?? null,
  };

  return NextResponse.json(payload, {
    // dati per un solo utente (le piattaforme non lo sono, ma la risposta viaggia
    // dietro il cookie di sessione): mai in una cache condivisa
    headers: { "Cache-Control": "private, max-age=3600" },
  });
}

function metaLine(
  mediaType: "movie" | "tv",
  runtime: number | null,
  seasons: number | null,
): string | null {
  if (mediaType === "tv") {
    if (!seasons) return null;
    return seasons === 1 ? "1 stagione" : `${seasons} stagioni`;
  }
  if (!runtime) return null;
  const h = Math.floor(runtime / 60);
  const m = runtime % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
