import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { parseStats } from "@/lib/profile/stats";
import { ProfileStatsSection } from "@/components/profile/ProfileStatsSection";
import { ProfileWallHeader } from "@/components/profile/ProfileWallHeader";
import {
  ProfileProgression,
  ProfileProgressionUnavailable,
} from "@/components/profile/ProfileProgression";
import { TopRatedShelf, toTopRated } from "@/components/profile/TopRatedShelf";
import { getProfileWallPosters } from "@/lib/tmdb/wall";
import { getFriendsData } from "@/lib/social/queries";
import { getConsensi } from "@/lib/legal/queries";
import { getProfileProgression } from "@/lib/profile/progression-queries";
import type { ProfileRecognition } from "@/lib/profile/progression";
import { PrivacySection } from "@/components/legal/PrivacySection";
import { getFavoritePeople } from "@/lib/people/queries";
import { FavoritePeopleShelf } from "@/components/people/FavoritePeopleShelf";
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
    { friends, incoming },
    consensi,
    progressionCounts,
    { data: recognitionRow },
    preferitiPersone,
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
    getConsensi(),
    getProfileProgression(user.id),
    // Separata dalla lettura base: durante una migration incompleta il profilo
    // continua a caricarsi e il riconoscimento viene semplicemente omesso.
    supabase
      .from("profiles")
      .select("verified_at, verified_role")
      .eq("id", user.id)
      .maybeSingle(),
    getFavoritePeople(user.id),
  ]);
  if (!profile) redirect("/onboarding");

  const stats = parseStats(statsJson);
  const topRated = toTopRated(topRatedRows);
  const recognition: ProfileRecognition = {
    verifiedAt: recognitionRow?.verified_at ?? null,
    verifiedRole: recognitionRow?.verified_role ?? null,
  };

  // muro personale: in visione + preferiti (voto e generi), riempito coi titoli del momento
  const wallPosters = await getProfileWallPosters(wallEntries ?? []);

  return (
    <main className="flex flex-col pb-16">
      {/* Testata: muro di locandine, identità e controlli */}
      <ProfileWallHeader posters={wallPosters} className="">
        <ProfileEditor
          userId={user.id}
          username={profile.username}
          displayName={profile.display_name ?? ""}
          avatarUrl={profile.avatar_url}
          friends={friends.slice(0, 3)}
          friendCount={friends.length}
          incomingCount={incoming.length}
          progressionCounts={progressionCounts}
          recognition={recognition}
        />
      </ProfileWallHeader>

      {/* Statistiche, generi e voti più alti */}
      <div>
        <div
          className="mx-auto mt-12 w-full max-w-[800px] md:mt-16"
          data-profile-journey-region
        >
          {progressionCounts ? (
            <ProfileProgression
              counts={progressionCounts}
              profileId={user.id}
              isOwn
              className="md:mx-8 lg:mx-10"
            />
          ) : (
            <ProfileProgressionUnavailable className="md:mx-8 lg:mx-10" />
          )}
        </div>
        <div className="mt-9 md:px-8 lg:px-10">
          <ProfileStatsSection stats={stats} heading="Le tue statistiche" />
        </div>
        <TopRatedShelf
          className="mt-9 md:px-8 lg:px-10"
          heading="I tuoi voti più alti"
          items={topRated}
          seeAllHref="/library"
        />
        <FavoritePeopleShelf
          persone={preferitiPersone}
          className="mt-9 md:px-8 lg:px-10"
        />
      </div>

      <PrivacySection consensi={consensi} username={profile.username}>
        <div aria-hidden="true" className="h-px bg-border" />
        <PrivacyRow isPrivate={profile.is_private} />
        <div aria-hidden="true" className="h-px bg-border" />
        <Link
          href="/import"
          className="flex items-center justify-between gap-4 py-4 transition-opacity active:opacity-60"
        >
          <span className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-accent/[0.18] text-accent-pale"
            >
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
              >
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">Importa i tuoi dati</span>
              <span className="text-xs text-muted">
                Netflix, Letterboxd, TV Time o un file.
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
      </PrivacySection>

      <footer className="mt-11 px-8 text-center text-[11px] leading-relaxed text-muted-2">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
        <br />
        Ritratti dei personaggi delle serie da TVmaze (CC BY-SA) e, per gli anime, da
        AniList.
      </footer>
    </main>
  );
}
