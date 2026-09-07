import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import type { CachedTitle } from "@/lib/tmdb/cache";
import type { TmdbMovieDetails, TmdbTvDetails, TmdbVideos } from "@/lib/tmdb/types";
import type { EntrySnapshot } from "@/lib/watch/actions";
import { Skeleton } from "@/components/ui/Skeleton";
import { NearbyShowtimes } from "@/components/cinema/NearbyShowtimes";
import { getPosterPalette } from "@/lib/colors/palette";
import { getOfficialTrailers } from "@/lib/trailers/official";
import { AmbientBackdrop } from "./AmbientBackdrop";
import { BAND_END_CLASS, TitleHeader } from "./TitleHeader";
import { WhereToWatch } from "./WhereToWatch";
import { TitleAbout } from "./TitleAbout";
import { RatingsPanel } from "./RatingsPanel";
import { TechnicalSheet } from "./TechnicalSheet";
import { CastRow } from "./CastRow";
import { SeasonList } from "./SeasonList";
import { RecommendationsShelf } from "./RecommendationsShelf";
import { TitleActions } from "./TitleActions";
import { TitleReviews } from "./TitleReviews";
import { SeriesProgress } from "./SeriesProgress";
import { FriendsWatching } from "./FriendsWatching";

/** Griglia comune al corpo e al suo scheletro: una colonna, due da `md`. */
const BODY_GRID =
  "flex flex-col gap-7 md:grid md:grid-cols-[340px_minmax(0,1fr)] md:items-start md:gap-8 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-12";

function WhereToWatchSkeleton() {
  return (
    <div className="space-y-2 px-5 md:px-0">
      <Skeleton className="h-6 w-40 rounded" />
      <Skeleton className="h-[68px] w-full rounded-[20px]" />
      <Skeleton className="h-[68px] w-full rounded-[20px]" />
    </div>
  );
}

/** Corpo della scheda mentre arrivano entry e sezioni (stessa geometria a due colonne). */
function BodySkeleton() {
  return (
    <div className="mt-4 md:mt-6 md:px-8 lg:px-10">
      <div className={BODY_GRID}>
        <div className="flex flex-col gap-6">
          <WhereToWatchSkeleton />
        </div>
        <div className="space-y-3 px-5 md:px-0">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-11/12 rounded" />
          <Skeleton className="h-4 w-2/3 rounded" />
        </div>
      </div>
    </div>
  );
}

/** Entry dell'utente sul titolo: letta una volta e passata alle sezioni. */
async function readViewerEntry(
  titleId: number,
  mediaType: "movie" | "tv",
): Promise<EntrySnapshot | null> {
  const user = await getViewer();
  if (!user) return null;
  const supabase = await createClient();

  const { data } = await supabase
    .from("watch_entries")
    .select(
      "status, rating, season_number, episode_number, is_private, started_at, finished_at",
    )
    .eq("user_id", user.id)
    .eq("title_id", titleId)
    .eq("media_type", mediaType)
    .maybeSingle();

  return data ?? null;
}

/** Sfondo "ambient" dai colori della locandina (palette in cache 30 g). */
async function Ambient({ posterPath }: { posterPath: string | null }) {
  const palette = await getPosterPalette(posterPath);
  return <AmbientBackdrop palette={palette} className={BAND_END_CLASS} />;
}

/** Tutto ciò che dipende dall'entry dell'utente: streamato dopo la testata. */
async function TitleDetails({ cached }: { cached: CachedTitle }) {
  const { title, providers } = cached;
  const raw = title.raw as unknown as (TmdbMovieDetails & TmdbTvDetails) | null;
  const entry = await readViewerEntry(title.id, title.media_type);

  return (
    <div className="mt-4 md:mt-6 md:px-8 lg:px-10">
      {/*
        Sotto `md` è una colonna sola e conta l'ordine di lettura: azioni, trama, dove
        guardarlo, poi il resto. Da `md` sono due colonne — a sinistra cosa puoi fare
        col titolo, dove si guarda e chi c'è dentro; a destra trama, orari del cinema e
        simili. I voti e le recensioni Zapp seguono subito il voto TMDB in
        fondo alla trama, non stanno più a tutta larghezza in fondo alla pagina.
        I due wrapper sono `display: contents` sul telefono, così le sezioni si
        mescolano nell'ordine giusto, e tornano colonne da `md`.
        Cast e "Al cinema" si sono scambiati di posto (scelta utente 2026-09-07):
        l'elenco del cast sta nella colonna stretta, gli orari delle sale no.
      */}
      <div className={BODY_GRID}>
        <div className="contents md:sticky md:top-6 md:flex md:flex-col md:gap-6">
          <div className="order-1 md:order-none">
            <Suspense fallback={null}>
              <TitleActions cached={cached} entry={entry} />
            </Suspense>
          </div>

          {/* "Dove guardarlo" in alto: è il motivo per cui si apre la scheda */}
          <div className="order-4 md:order-none">
            <Suspense fallback={<WhereToWatchSkeleton />}>
              <WhereToWatch title={title} providers={providers} />
            </Suspense>
          </div>

          {raw?.credits && (
            <div className="order-7 md:order-none">
              <CastRow cast={raw.credits.cast} />
            </div>
          )}

          <div className="order-8 md:order-none">
            <Suspense fallback={null}>
              <FriendsWatching titleId={title.id} mediaType={title.media_type} />
            </Suspense>
          </div>
        </div>

        <div className="contents md:flex md:flex-col md:gap-8">
          <div className="order-2 md:order-none">
            <TitleAbout
              title={title}
              // Il voto che chiude la trama è lo ZappScore (sette fonti via MDBList);
              // `RatingsPanel` ricade da sé sul voto TMDB dove non c'è ancora. Sta
              // dietro un `Suspense` perché la lettura del catalogo non trattenga la
              // trama, che è già pronta.
              ratings={
                <Suspense fallback={null}>
                  <RatingsPanel
                    titleId={title.id}
                    mediaType={title.media_type}
                    tmdbVote={title.vote_average}
                    tmdbVotes={title.vote_count}
                  />
                </Suspense>
              }
            />
          </div>

          {/* i voti Zapp stanno attaccati al voto TMDB che chiude la trama
            (richiesta utente 2026-09-07): prima erano in fondo alla pagina */}
          <div className="order-3 md:order-none">
            <Suspense fallback={null}>
              <TitleReviews cached={cached} entry={entry} />
            </Suspense>
          </div>

          {title.media_type === "tv" && (
            <div className="order-5 md:order-none">
              <Suspense fallback={null}>
                <SeriesProgress title={title} entry={entry} />
              </Suspense>
            </div>
          )}

          {title.media_type === "movie" && (
            <div className="order-6 md:order-none">
              <Suspense fallback={<WhereToWatchSkeleton />}>
                <NearbyShowtimes title={title} />
              </Suspense>
            </div>
          )}

          {title.media_type === "tv" && raw?.seasons && (
            <div className="order-6 md:order-none">
              <SeasonList
                tvId={title.id}
                seasons={raw.seasons}
                watchedSeason={entry?.season_number ?? null}
                watchedEpisode={entry?.episode_number ?? null}
                completed={entry?.status === "watched"}
              />
            </div>
          )}

          <div className="order-10 md:order-none">
            <RecommendationsShelf recommendations={raw?.recommendations} />
          </div>

          <div className="order-11 md:order-none">
            <TechnicalSheet title={title} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Scheda titolo in streaming: la testata (immagine + trailer) parte nel primo
 * pezzo di HTML, senza aspettare palette, entry, link o recensioni; il resto
 * arriva subito dopo nei propri confini Suspense. I trailer (solo italiani da canali
 * ufficiali, con il riquadro dell'immagine reale) si aspettano qui, prima della
 * testata: la banda ha sempre la stessa misura, il video ci sta dentro intero.
 */
export async function TitleBody({ cached }: { cached: CachedTitle }) {
  const { title } = cached;
  const trailers = await getOfficialTrailers({
    videos: (title.raw as { videos?: TmdbVideos } | null)?.videos,
    titleId: title.id,
    mediaType: title.media_type,
    name: title.title,
    releaseDate: title.release_date,
  });

  return (
    <main className="relative isolate pb-36 lg:pb-16">
      <Suspense fallback={null}>
        <Ambient posterPath={title.poster_path} />
      </Suspense>
      <TitleHeader title={title} trailers={trailers} />
      <Suspense fallback={<BodySkeleton />}>
        <TitleDetails cached={cached} />
      </Suspense>
    </main>
  );
}
