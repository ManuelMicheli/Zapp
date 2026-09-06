import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { posterUrl } from "@/lib/config";
import { PosterWall } from "@/components/marketing/PosterWall";
import { GenreBar } from "@/components/profile/GenreBar";
import { getProfileWallPosters } from "@/lib/tmdb/wall";
import { getFriendsData } from "@/lib/social/queries";
import { ProfileEditor, PrivacyRow } from "./ProfileEditor";
import { LogoutButton } from "./LogoutButton";

export const metadata = { title: "Profilo" };

/** Entry più recenti da cui il muro sceglie le locandine (bastano per 60 tile). */
const WALL_ENTRY_LIMIT = 200;

interface ProfileStats {
  filmsWatched: number;
  seriesWatched: number;
  watchedTotal: number;
  episodesSeen: number;
  minutes: number;
  topGenres: { name: string; count: number }[];
}

/** Legge il JSON di `profile_stats`; qualunque forma inattesa → zeri, mai errore. */
function parseStats(json: unknown): ProfileStats {
  const o = (json ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : 0);
  const genres = Array.isArray(o.top_genres) ? (o.top_genres as unknown[]) : [];
  return {
    filmsWatched: n("films_watched"),
    seriesWatched: n("series_watched"),
    watchedTotal: n("watched_total"),
    episodesSeen: n("episodes_seen"),
    minutes: n("minutes"),
    topGenres: genres
      .map((g) => g as { name?: unknown; count?: unknown })
      .filter((g) => typeof g.name === "string" && typeof g.count === "number")
      .map((g) => ({ name: g.name as string, count: g.count as number })),
  };
}

/**
 * Sfumatura verso il nero sotto il muro di locandine: resta leggera a lungo
 * (il muro si vede fin quasi al fondo della testata) e chiude sul nero solo
 * negli ultimi 12%, dove comincia il contenuto.
 */
const HEADER_SCRIM =
  "linear-gradient(180deg,rgba(0,0,0,0.5) 0%,rgba(0,0,0,0.18) 26%,rgba(0,0,0,0.32) 55%,rgba(0,0,0,0.62) 74%,rgba(0,0,0,0.9) 88%,#000 100%)";

export default async function ProfilePage() {
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) redirect("/login");

  // statistiche in SQL (`profile_stats`, migration 0010): 400 byte invece di tutte
  // le entry con il JSON TMDB; muro e "voti più alti" con due query snelle
  const [
    { data: profile },
    { data: statsJson },
    { data: wallEntries },
    { data: topRatedRows },
    { friends },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name, avatar_url, is_private")
      .eq("id", user.id)
      .single(),
    supabase.rpc("profile_stats", { uid: user.id }),
    supabase
      .from("watch_entries")
      .select(
        "status, rating, updated_at, title:titles!watch_entries_title_id_media_type_fkey(poster_path, genres)",
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(WALL_ENTRY_LIMIT),
    supabase
      .from("watch_entries")
      .select(
        "rating, title:titles!watch_entries_title_id_media_type_fkey(id, media_type, title, poster_path)",
      )
      .eq("user_id", user.id)
      .not("rating", "is", null)
      .order("rating", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(5),
    getFriendsData(),
  ]);
  if (!profile) redirect("/onboarding");

  const stats = parseStats(statsJson);
  const hours = Math.round(stats.minutes / 60);
  /** Giorni pieni di visione: mostrati solo quando ce n'è almeno uno. */
  const days = Math.floor(stats.minutes / 1440);
  const topGenres = stats.topGenres;
  const genreTotal = topGenres.reduce((acc, g) => acc + g.count, 0);
  const topRated = (topRatedRows ?? []).filter((e) => e.title);
  const statItems = [
    { label: "Film visti", value: stats.filmsWatched },
    { label: "Serie viste", value: stats.seriesWatched },
    { label: "Episodi", value: stats.episodesSeen },
  ];

  // muro personale: in visione + preferiti (voto e generi), riempito coi titoli del momento
  const wallPosters = await getProfileWallPosters(wallEntries ?? []);

  return (
    <main className="flex flex-col pb-16 md:grid md:grid-cols-[340px_minmax(0,1fr)] md:items-start md:gap-x-8 md:px-8 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-x-10 lg:px-10">
      {/* Testata: muro di locandine, identità e controlli */}
      <header className="relative h-[480px] shrink-0 overflow-hidden md:col-span-2 md:col-start-1 md:row-start-1 md:-mx-8 lg:h-[620px] lg:-mx-10">
        <PosterWall
          posters={wallPosters}
          height={560}
          opacity={0.75}
          speed="slow"
          className="md:hidden"
        />
        {/* Desktop: il muro copre tutta la larghezza del contenuto e scende
            fin sotto l'immagine profilo (il velo lo lascia leggere a lungo) */}
        <PosterWall
          posters={wallPosters}
          columns={20}
          width="calc(100% + 140px)"
          height={740}
          opacity={0.75}
          speed="slow"
          className="hidden md:block"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: HEADER_SCRIM }}
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
      <div className="md:col-start-2 md:row-start-2 md:mt-8">
        <section className="flex flex-col gap-3.5 px-5 md:px-0">
          <h2 className="text-xl font-bold tracking-[-0.03em]">Le tue statistiche</h2>
          {/* Una sola card: il totale di ore come numero eroe, i conteggi in
              tre riquadri; da lg tutto su una riga, così la card non si
              allunga a vuoto sui monitor larghi. */}
          <div className="flex flex-col gap-4 rounded-[22px] border border-border bg-surface p-5 lg:flex-row lg:items-stretch lg:gap-7 lg:p-6">
            <div className="flex flex-col gap-1.5 lg:w-[230px] lg:shrink-0 lg:justify-center">
              <p className="text-[68px] font-extrabold leading-[0.82] tracking-[-0.06em]">
                {hours}
              </p>
              <p className="text-sm text-muted">ore di film e serie</p>
              <p className="text-xs text-muted-2">
                {stats.watchedTotal} {stats.watchedTotal === 1 ? "titolo" : "titoli"}
                {days > 0 && ` · ${days} ${days === 1 ? "giorno" : "giorni"} di visione`}
              </p>
            </div>
            <div aria-hidden="true" className="h-px bg-border lg:h-auto lg:w-px" />
            <dl className="grid grid-cols-3 gap-2.5 lg:flex-1 lg:gap-3">
              {statItems.map((s) => (
                <div
                  key={s.label}
                  className="flex flex-col gap-1 rounded-[16px] bg-surface-2 px-3.5 py-3 lg:justify-center lg:gap-1.5 lg:px-5 lg:py-6"
                >
                  <dd className="text-[24px] font-bold leading-none tracking-[-0.04em] lg:text-[32px]">
                    {s.value}
                  </dd>
                  <dt className="text-[11px] leading-tight text-muted lg:text-[13px]">
                    {s.label}
                  </dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {topGenres.length > 0 && (
          <section className="mt-9 flex flex-col gap-3.5 px-5 md:px-0">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-bold tracking-[-0.03em]">Generi più visti</h2>
              <p className="text-xs text-muted">su {stats.watchedTotal} titoli</p>
            </div>
            <GenreBar items={topGenres} total={genreTotal} />
          </section>
        )}

        {topRated.length > 0 && (
          <section className="mt-9 flex flex-col gap-3.5">
            <div className="flex items-baseline justify-between px-5 md:px-0">
              <h2 className="text-xl font-bold tracking-[-0.03em]">
                I tuoi voti più alti
              </h2>
              <Link href="/library" className="text-[13px] font-medium text-accent-soft">
                Vedi tutti
              </Link>
            </div>
            <div className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1 md:px-0">
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

      {/* Impostazioni: privacy, import e uscita in un'unica lista */}
      <section className="mt-9 flex flex-col gap-3.5 px-5 md:col-start-1 md:row-start-2 md:mt-8 md:px-0">
        <h2 className="text-xl font-bold tracking-[-0.03em]">Impostazioni</h2>
        <div className="flex flex-col rounded-[22px] border border-border bg-surface px-4">
          <PrivacyRow isPrivate={profile.is_private} />
          <div aria-hidden="true" className="h-px bg-border" />
          <Link
            href="/import/netflix"
            className="flex items-center justify-between gap-4 py-4 transition-opacity active:opacity-60"
          >
            <span className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[#E50914] text-lg font-extrabold leading-none text-white"
              >
                N
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold">Importa da Netflix</span>
                <span className="text-xs text-muted">
                  Porta la cronologia di visione nella libreria.
                </span>
              </span>
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
              className="shrink-0 text-muted-2"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </Link>
          <div aria-hidden="true" className="h-px bg-border" />
          <LogoutButton />
        </div>
      </section>

      <footer className="mt-11 px-8 text-center text-[11px] leading-relaxed text-muted-2 md:col-span-2 md:col-start-1 md:row-start-3">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </footer>
    </main>
  );
}
