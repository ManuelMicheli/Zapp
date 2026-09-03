import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { Avatar } from "@/components/social/Avatar";
import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import { PosterCard } from "@/components/ui/PosterCard";
import { FriendButton, type FriendState } from "./FriendButton";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const [{ data: fullProfile }, { data: friendshipRows }, { data: entries }] =
    await Promise.all([
      // riesce solo se pubblico o amici (RLS)
      supabase.from("profiles").select("is_private").eq("id", targetId).maybeSingle(),
      supabase
        .from("friendships")
        .select("requester_id, addressee_id, status")
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${user.id})`,
        ),
      supabase
        .from("watch_entries")
        .select(
          "status, rating, media_type, title_id, title:titles!watch_entries_title_id_media_type_fkey(title, poster_path)",
        )
        .eq("user_id", targetId)
        .in("status", ["watching", "watched"])
        .order("updated_at", { ascending: false })
        .limit(20),
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
  const watching = visible.filter((e) => e.status === "watching");
  const watched = visible.filter((e) => e.status === "watched").slice(0, 10);
  const canSeeLists = fullProfile != null;

  const name = target.display_name ?? target.username ?? "";

  return (
    <>
      <TopBar title={`@${target.username}`} />
      <main className="pb-28">
        <div className="flex items-center gap-4 px-4">
          <Avatar url={target.avatar_url} name={name} size={64} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{name}</p>
            <p className="truncate text-sm text-muted">@{target.username}</p>
          </div>
        </div>

        <div className="mt-4 px-4">
          <FriendButton targetId={targetId} initialState={friendState} />
        </div>

        {!canSeeLists ? (
          <div className="mx-4 mt-6 rounded-2xl border border-border bg-surface p-6 text-center">
            <p className="text-sm font-semibold">Profilo privato</p>
            <p className="mt-1 text-xs text-muted">
              Diventa amico di @{target.username} per vedere le sue liste.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            {watching.length > 0 && (
              <HorizontalShelf title="Sto guardando">
                {watching.map((e) => (
                  <PosterCard
                    key={`${e.media_type}-${e.title_id}`}
                    className="w-28 shrink-0"
                    title={e.title?.title ?? ""}
                    posterPath={e.title?.poster_path ?? null}
                    href={`/title/${e.media_type}/${e.title_id}`}
                  />
                ))}
              </HorizontalShelf>
            )}
            {watched.length > 0 && (
              <HorizontalShelf title="Visti di recente">
                {watched.map((e) => (
                  <PosterCard
                    key={`${e.media_type}-${e.title_id}`}
                    className="w-28 shrink-0"
                    title={
                      e.rating != null
                        ? `★ ${e.rating} · ${e.title?.title ?? ""}`
                        : (e.title?.title ?? "")
                    }
                    posterPath={e.title?.poster_path ?? null}
                    href={`/title/${e.media_type}/${e.title_id}`}
                  />
                ))}
              </HorizontalShelf>
            )}
            {watching.length === 0 && watched.length === 0 && (
              <p className="px-4 text-center text-sm text-muted">
                Nessuna attività visibile.
              </p>
            )}
          </div>
        )}
      </main>
    </>
  );
}
