import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { posterUrl } from "@/lib/config";
import { PosterWall } from "@/components/marketing/PosterWall";
import { GenreBar } from "@/components/profile/GenreBar";
import { getWallPosters } from "@/lib/tmdb/wall";
import { getFriendsData } from "@/lib/social/queries";
import { availableSeasons, episodesWatched, totalEpisodes } from "@/lib/watch/episodes";
import { ProfileEditor, PrivacyRow } from "./ProfileEditor";
import { LogoutButton } from "./LogoutButton";

export const metadata = { title: "Profilo" };

/** Sfumatura verso il nero sotto il muro di locandine. */
const HEADER_SCRIM =
  "linear-gradient(180deg,rgba(0,0,0,0.55) 0%,rgba(0,0,0,0.25) 25%,rgba(0,0,0,0.7) 60%,rgba(0,0,0,0.96) 85%,#000 100%)";
const HEADER_GLOW =
  "radial-gradient(circle,rgba(139,92,246,0.55) 0%,rgba(139,92,246,0.15) 45%,rgba(0,0,0,0) 70%)";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: entries }, { friends }] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name, avatar_url, is_private")
      .eq("id", user.id)
      .single(),
    supabase
      .from("watch_entries")
      .select(
        "status, rating, media_type, season_number, episode_number, title:titles!watch_entries_title_id_media_type_fkey(id, media_type, title, poster_path, runtime, genres, raw)",
      )
      .eq("user_id", user.id),
    getFriendsData(),
  ]);
  if (!profile) redirect("/onboarding");

  const all = entries ?? [];
  const watched = all.filter((e) => e.status === "watched");
  const filmsWatched = watched.filter((e) => e.media_type === "movie").length;
  const seriesWatched = watched.filter((e) => e.media_type === "tv").length;

  // episodi stimati da season_number/episode_number (serie completate = tutti)
  let episodesSeen = 0;
  let minutes = 0;
  for (const e of all) {
    if (e.media_type === "movie") {
      if (e.status === "watched") minutes += e.title?.runtime ?? 0;
      continue;
    }
    const seasons = availableSeasons(e.title?.raw ?? null);
    let count = 0;
    if (e.status === "watched") {
      count = totalEpisodes(seasons);
    } else if (e.season_number != null && e.episode_number != null) {
      count = episodesWatched(seasons, e.season_number, e.episode_number);
    }
    episodesSeen += count;
    minutes += count * (e.title?.runtime ?? 40);
  }
  const hours = Math.round(minutes / 60);

  // generi più visti
  const genreCount = new Map<string, number>();
  for (const e of watched) {
    const genres = (e.title?.genres as { name?: string }[] | null) ?? [];
    for (const g of genres) {
      if (g.name) genreCount.set(g.name, (genreCount.get(g.name) ?? 0) + 1);
    }
  }
  const topGenres = [...genreCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
  const genreTotal = topGenres.reduce((acc, g) => acc + g.count, 0);

  const topRated = all
    .filter((e) => e.rating != null && e.title)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 5);

  const stats = [
    { label: "Film visti", value: filmsWatched },
    { label: "Serie viste", value: seriesWatched },
    { label: "Episodi", value: episodesSeen },
  ];

  // il muro usa le locandine viste dall'utente, con fallback ai trending
  const watchedPosters = watched
    .map((e) => e.title?.poster_path)
    .filter((p): p is string => Boolean(p))
    .slice(0, 16);
  const wallPosters =
    watchedPosters.length >= 8 ? watchedPosters : await getWallPosters();

  return (
    <main className="flex flex-col pb-36 lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-x-10 lg:px-10">
      {/* Testata: muro di locandine, identità e controlli */}
      <header className="relative h-[400px] shrink-0 overflow-hidden lg:col-span-2 lg:col-start-1 lg:row-start-1">
        <PosterWall
          posters={wallPosters}
          height={470}
          opacity={0.75}
          speed="slow"
          className="lg:hidden"
        />
        {/* Desktop: il muro copre tutta la larghezza del contenuto */}
        <PosterWall
          posters={wallPosters}
          columns={12}
          width={1450}
          height={520}
          opacity={0.75}
          speed="slow"
          className="hidden lg:block"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: HEADER_SCRIM }}
        />
        <div
          aria-hidden="true"
          className="absolute left-[75px] top-[60px] size-60 rounded-full blur-[36px] lg:left-1/2 lg:-translate-x-1/2"
          style={{ background: HEADER_GLOW }}
        />
        <ProfileEditor
          userId={user.id}
          username={profile.username}
          displayName={profile.display_name ?? ""}
          avatarUrl={profile.avatar_url}
          friends={friends.slice(0, 3)}
          friendCount={friends.length}
        />
      </header>

      {/* Statistiche, generi e voti più alti */}
      <div className="lg:col-start-2 lg:row-start-2 lg:mt-8">
        <section className="flex items-stretch gap-5 px-5 lg:px-0">
          <div className="flex shrink-0 flex-col gap-0.5">
            <p className="text-[76px] font-extrabold leading-[0.9] tracking-[-0.06em]">
              {hours}
            </p>
            <p className="text-sm text-white/60">ore di film e serie</p>
          </div>
          <div aria-hidden="true" className="w-px self-stretch bg-white/10" />
          <dl className="flex flex-1 flex-col justify-between py-0.5">
            {stats.map((s) => (
              <div key={s.label} className="flex items-baseline justify-between">
                <dt className="text-[13px] text-white/60">{s.label}</dt>
                <dd className="text-xl font-bold tracking-[-0.03em]">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {topGenres.length > 0 && (
          <section className="mt-9 flex flex-col gap-3.5 px-5 lg:px-0">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-bold tracking-[-0.03em]">Generi più visti</h2>
              <p className="text-xs text-muted">su {watched.length} titoli</p>
            </div>
            <GenreBar items={topGenres} total={genreTotal} />
          </section>
        )}

        {topRated.length > 0 && (
          <section className="mt-9 flex flex-col gap-3.5">
            <div className="flex items-baseline justify-between px-5 lg:px-0">
              <h2 className="text-xl font-bold tracking-[-0.03em]">
                I tuoi voti più alti
              </h2>
              <Link href="/library" className="text-[13px] font-medium text-accent-soft">
                Vedi tutti
              </Link>
            </div>
            <div className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1 lg:px-0">
              {topRated.map((e) => {
                const t = e.title!;
                const src = posterUrl(t.poster_path, "w342");
                return (
                  <Link
                    key={`${t.media_type}-${t.id}`}
                    href={`/title/${t.media_type}/${t.id}`}
                    className="relative h-[225px] w-[150px] shrink-0 overflow-hidden rounded-[18px] bg-surface-2 shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
                  >
                    {src ? (
                      <Image
                        src={src}
                        alt=""
                        fill
                        sizes="150px"
                        className="object-cover"
                      />
                    ) : null}
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-[110px] bg-gradient-to-t from-black/85 to-transparent"
                    />
                    <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
                      <span className="text-[13px] font-semibold leading-tight">
                        {t.title}
                      </span>
                      <span className="shrink-0 text-[30px] font-extrabold leading-none tracking-[-0.05em] text-accent-pale">
                        {e.rating}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Impostazioni */}
      <section className="mt-8 px-5 lg:col-start-1 lg:row-start-2 lg:px-0">
        <div className="flex flex-col rounded-[22px] border border-border bg-surface px-3.5 py-1">
          <PrivacyRow isPrivate={profile.is_private} />
          <div aria-hidden="true" className="h-px bg-border" />
          <Link
            href="/import/netflix"
            className="flex h-14 items-center justify-between gap-3"
          >
            <span className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-[30px] items-center justify-center rounded-lg bg-[#E50914] text-base font-extrabold text-white"
              >
                N
              </span>
              <span className="text-[15px] font-medium">Importa da Netflix</span>
            </span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="shrink-0 text-muted"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </Link>
          <div aria-hidden="true" className="h-px bg-border" />
          <LogoutButton />
        </div>
      </section>

      <footer className="mt-11 px-8 text-center text-[11px] leading-relaxed text-muted-2 lg:col-span-2 lg:col-start-1 lg:row-start-3">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </footer>
    </main>
  );
}
