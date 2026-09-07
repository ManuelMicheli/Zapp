import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { parseStats } from "@/lib/profile/stats";
import { ProfileStatsSection } from "@/components/profile/ProfileStatsSection";
import { ProfileWallHeader } from "@/components/profile/ProfileWallHeader";
import { TopRatedShelf, toTopRated } from "@/components/profile/TopRatedShelf";
import { getProfileWallPosters } from "@/lib/tmdb/wall";
import { getFriendsData } from "@/lib/social/queries";
import { ProfileEditor, PrivacyRow } from "./ProfileEditor";
import { LogoutButton } from "./LogoutButton";

export const metadata = { title: "Profilo" };

/** Entry più recenti da cui il muro sceglie le locandine (bastano per 60 tile). */
const WALL_ENTRY_LIMIT = 200;

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
  const topRated = toTopRated(topRatedRows);

  // muro personale: in visione + preferiti (voto e generi), riempito coi titoli del momento
  const wallPosters = await getProfileWallPosters(wallEntries ?? []);

  return (
    <main className="flex flex-col pb-16 md:grid md:grid-cols-[340px_minmax(0,1fr)] md:items-start md:gap-x-8 md:px-8 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-x-10 lg:px-10">
      {/* Testata: muro di locandine, identità e controlli */}
      <ProfileWallHeader
        posters={wallPosters}
        className="md:col-span-2 md:col-start-1 md:row-start-1 md:-mx-8 lg:-mx-10"
      >
        <ProfileEditor
          userId={user.id}
          username={profile.username}
          displayName={profile.display_name ?? ""}
          avatarUrl={profile.avatar_url}
          friends={friends.slice(0, 3)}
          friendCount={friends.length}
        />
      </ProfileWallHeader>

      {/* Statistiche, generi e voti più alti */}
      <div className="md:col-start-2 md:row-start-2 md:mt-8">
        <ProfileStatsSection stats={stats} heading="Le tue statistiche" />
        <TopRatedShelf
          className="mt-9"
          heading="I tuoi voti più alti"
          items={topRated}
          seeAllHref="/library"
        />
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
