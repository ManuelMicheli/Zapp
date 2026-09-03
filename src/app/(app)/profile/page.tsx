import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { PosterCard } from "@/components/ui/PosterCard";
import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import { availableSeasons, episodesWatched, totalEpisodes } from "@/lib/watch/episodes";
import { ProfileEditor } from "./ProfileEditor";
import { LogoutButton } from "./LogoutButton";
import Link from "next/link";

export const metadata = { title: "Profilo" };

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: entries }] = await Promise.all([
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
    .slice(0, 5);

  const topRated = all
    .filter((e) => e.rating != null && e.title)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 5);

  const stats = [
    { label: "Film visti", value: filmsWatched },
    { label: "Serie viste", value: seriesWatched },
    { label: "Episodi", value: episodesSeen },
    { label: "Ore stimate", value: hours },
  ];

  return (
    <>
      <TopBar title="Profilo" />
      <main className="flex min-h-[70dvh] flex-col px-4 pb-28 lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-10 lg:px-6">
        <div className="lg:col-start-1 lg:row-start-1">
          <ProfileEditor
            userId={user.id}
            username={profile.username}
            displayName={profile.display_name ?? ""}
            avatarUrl={profile.avatar_url}
            isPrivate={profile.is_private}
          />
          <div className="mt-6 hidden space-y-2 lg:block">
            <Link
              href="/import/netflix"
              className="block w-full rounded-xl border border-border bg-surface px-4 py-3 text-center text-base font-medium"
            >
              Importa da Netflix
            </Link>
            <LogoutButton />
          </div>
        </div>

        <div className="lg:col-start-2 lg:row-start-1">
        <div className="mt-4 grid grid-cols-4 gap-2 lg:mt-0">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-border bg-surface p-3 text-center"
            >
              <p className="text-xl font-extrabold">{s.value}</p>
              <p className="mt-0.5 text-[10px] text-muted">{s.label}</p>
            </div>
          ))}
        </div>

        {topGenres.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-base font-bold">Generi più visti</h2>
            <div className="flex flex-wrap gap-2">
              {topGenres.map(([name, count]) => (
                <span
                  key={name}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs"
                >
                  {name} <span className="text-muted">· {count}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {topRated.length > 0 && (
          <div className="-mx-4 mt-6">
            <HorizontalShelf title="I tuoi voti più alti">
              {topRated.map((e) => (
                <PosterCard
                  key={`${e.title!.media_type}-${e.title!.id}`}
                  className="w-28 shrink-0"
                  title={`★ ${e.rating} · ${e.title!.title}`}
                  posterPath={e.title!.poster_path}
                  href={`/title/${e.title!.media_type}/${e.title!.id}`}
                />
              ))}
            </HorizontalShelf>
          </div>
        )}

        </div>

        <div className="mt-6 space-y-2 lg:hidden">
          <Link
            href="/import/netflix"
            className="block w-full rounded-xl border border-border bg-surface px-4 py-3 text-center text-base font-medium"
          >
            Importa da Netflix
          </Link>
          <LogoutButton />
        </div>

        <footer className="mt-auto pt-12 text-center text-[11px] leading-relaxed text-muted lg:col-span-2">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </footer>
      </main>
    </>
  );
}
