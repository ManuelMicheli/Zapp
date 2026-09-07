import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { parseStats } from "@/lib/profile/stats";
import { getProfileWallPosters } from "@/lib/tmdb/wall";
import { BackButton } from "@/components/layout/BackButton";
import { Avatar } from "@/components/social/Avatar";
import { AvatarHalo } from "@/components/profile/AvatarHalo";
import { ProfileWallHeader } from "@/components/profile/ProfileWallHeader";
import { ProfileStatsSection } from "@/components/profile/ProfileStatsSection";
import { TopRatedShelf, toTopRated } from "@/components/profile/TopRatedShelf";
import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import { PosterCard } from "@/components/ui/PosterCard";
import { FriendButton, type FriendState } from "./FriendButton";

/** Entry più recenti da cui il muro sceglie le locandine (bastano per 60 tile). */
const WALL_ENTRY_LIMIT = 200;
/** Locandine per scaffale. */
const SHELF_LIMIT = 12;

interface ShelfEntry {
  status: string;
  rating: number | null;
  media_type: string;
  title_id: number;
  title: { title: string; poster_path: string | null } | null;
}

/** Scaffale di locandine per una lista dell'altro utente. */
function Shelf({
  title,
  entries,
  showRating,
}: {
  title: string;
  entries: ShelfEntry[];
  showRating: boolean;
}) {
  return (
    <HorizontalShelf title={title}>
      {entries.map((e) => (
        <PosterCard
          key={`${e.media_type}-${e.title_id}`}
          className="w-28 shrink-0"
          title={e.title?.title ?? ""}
          posterPath={e.title?.poster_path ?? null}
          rating={showRating ? e.rating : null}
          href={`/title/${e.media_type}/${e.title_id}`}
        />
      ))}
    </HorizontalShelf>
  );
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();
  const user = await getViewer();
  if (!user) redirect("/login");

  // visibile anche per profili privati (solo username/avatar); esclude i bloccati
  const { data: target } = await supabase
    .from("user_search")
    .select("*")
    .eq("username", username)
    .maybeSingle();
  if (!target || !target.id) notFound();

  if (target.id === user.id) redirect("/profile");
  const targetId = target.id;

  // Stesse letture del proprio profilo, sull'altro utente: le policy RLS
  // (`watch_entries_select_friends`) lasciano passare solo le entry non private
  // degli amici, quindi statistiche e liste restano vuote per gli estranei.
  const [
    { data: fullProfile },
    { data: friendshipRows },
    { data: statsJson },
    { data: entries },
    { data: topRatedRows },
  ] = await Promise.all([
    // riesce solo se pubblico o amici (RLS)
    supabase.from("profiles").select("is_private").eq("id", targetId).maybeSingle(),
    supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${user.id})`,
      ),
    // `profile_stats` è security invoker: conta solo ciò che chi guarda può vedere
    supabase.rpc("profile_stats", { uid: targetId }),
    supabase
      .from("watch_entries")
      .select(
        "status, rating, media_type, title_id, last_watched_at, title:titles!watch_entries_title_id_media_type_fkey(title, poster_path, genres)",
      )
      .eq("user_id", targetId)
      .order("last_watched_at", { ascending: false })
      .limit(WALL_ENTRY_LIMIT),
    supabase
      .from("watch_entries")
      .select(
        "rating, title:titles!watch_entries_title_id_media_type_fkey(id, media_type, title, poster_path)",
      )
      .eq("user_id", targetId)
      .not("rating", "is", null)
      .order("rating", { ascending: false })
      .order("last_watched_at", { ascending: false })
      .limit(5),
  ]);

  let friendState: FriendState = "none";
  const row = (friendshipRows ?? [])[0];
  if (row) {
    if (row.status === "accepted") friendState = "friends";
    else if (row.status === "pending") {
      friendState = row.requester_id === user.id ? "outgoing" : "incoming";
    } else if (row.status === "blocked") {
      friendState = "blocked";
    }
  }

  const visible = entries ?? [];
  const watching = visible.filter((e) => e.status === "watching").slice(0, SHELF_LIMIT);
  const watched = visible.filter((e) => e.status === "watched").slice(0, SHELF_LIMIT);
  const stats = parseStats(statsJson);
  const topRated = toTopRated(topRatedRows);
  const canSeeLists = fullProfile != null;
  /** Nulla di visibile: profilo pubblico ma non amico, o libreria vuota. */
  const hasActivity = visible.length > 0 || stats.watchedTotal > 0;

  const name = target.display_name ?? target.username ?? "";
  // muro personale dell'altro utente (dipende dalle entry, quindi fuori dal Promise.all)
  const wallPosters = await getProfileWallPosters(visible);

  return (
    <main className="flex flex-col pb-16 md:px-8 lg:px-10">
      <ProfileWallHeader posters={wallPosters} className="md:-mx-8 lg:-mx-10">
        <div className="absolute inset-x-5 top-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] z-20 flex items-center lg:inset-x-10">
          <BackButton inline />
        </div>

        {/* Identità ancorata al fondo della testata, come sul proprio profilo */}
        <div className="absolute inset-x-0 bottom-9 z-10 flex flex-col items-center gap-3.5 lg:bottom-12">
          <AvatarHalo>
            <Avatar url={target.avatar_url} name={name} size={124} />
          </AvatarHalo>

          <div className="flex flex-col items-center gap-1 px-5 text-center">
            <p className="text-[34px] font-extrabold leading-none tracking-[-0.05em]">
              {name}
            </p>
            <p className="text-[15px] text-white/55">@{target.username}</p>
          </div>

          {/* "Consiglia" del mockup è omesso: richiede un selettore di titoli, fuori scope */}
          {/* contatore "amici" rimosso: RLS friendships_select_involved limita la count ad amici/coinvolti,
              rendendo il numero inesatto per altri utenti; servirebbe una RPC SECURITY DEFINER dedicata (migrazione futura) */}
          <FriendButton targetId={targetId} initialState={friendState} />
        </div>
      </ProfileWallHeader>

      {!canSeeLists ? (
        <div className="mx-5 mt-7 rounded-[20px] border border-border bg-surface p-6 text-center md:mx-0">
          <p className="text-sm font-semibold">Profilo privato</p>
          <p className="mt-1 text-xs text-muted">
            Diventa amico di @{target.username} per vedere le sue liste.
          </p>
        </div>
      ) : !hasActivity ? (
        <p className="mt-7 px-5 text-center text-sm text-muted md:px-0">
          Nessuna attività visibile.
        </p>
      ) : (
        <div className="mt-8">
          {watching.length > 0 && (
            <Shelf title="Sto guardando" entries={watching} showRating={false} />
          )}

          <div className={watching.length > 0 ? "mt-9" : ""}>
            <ProfileStatsSection stats={stats} heading={`Le statistiche di ${name}`} />
          </div>

          <TopRatedShelf
            className="mt-9"
            heading={`I voti più alti di ${name}`}
            items={topRated}
          />

          {watched.length > 0 && (
            <div className="mt-9">
              <Shelf title="Visti di recente" entries={watched} showRating />
            </div>
          )}
        </div>
      )}
    </main>
  );
}
