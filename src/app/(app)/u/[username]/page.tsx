import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { posterUrl } from "@/lib/config";
import { BackButton } from "@/components/layout/BackButton";
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

  const [
    { data: fullProfile },
    { data: friendshipRows },
    { data: entries },
    { count: watchedCount },
  ] = await Promise.all([
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
    // conteggi esatti: la query sopra è limitata a 20 righe e lo scaffale a 10
    supabase
      .from("watch_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", targetId)
      .eq("status", "watched"),
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
  // sfondo sfocato: prima locandina di "sto guardando", altrimenti dei visti
  const backdrop = posterUrl(
    watching[0]?.title?.poster_path ?? watched[0]?.title?.poster_path ?? null,
    "w342",
  );

  return (
    <main className="relative pb-36">
      <header className="relative isolate">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[320px] overflow-hidden">
          {backdrop && (
            <Image
              src={backdrop}
              alt=""
              fill
              priority
              sizes="100vw"
              className="scale-[1.4] object-cover object-[50%_20%] opacity-50 blur-[30px] saturate-[1.2]"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-black" />
        </div>

        <div className="flex items-center px-5 pt-[calc(env(safe-area-inset-top,0px)+40px)] lg:px-10">
          <BackButton inline />
        </div>

        <div className="mt-5 flex flex-col items-center gap-3.5 px-5">
          <div className="rounded-full shadow-[var(--shadow-card)]">
            <Avatar url={target.avatar_url} name={name} size={104} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-[30px] font-extrabold leading-none tracking-[-0.05em]">
              {name}
            </p>
            <p className="text-sm text-white/55">@{target.username}</p>
          </div>

          {/* "Consiglia" del mockup è omesso: richiede un selettore di titoli, fuori scope */}
          {/* contatore "amici" rimosso: RLS friendships_select_involved limita la count ad amici/coinvolti,
              rendendo il numero inesatto per altri utenti; servirebbe una RPC SECURITY DEFINER dedicata (migrazione futura) */}
          <FriendButton targetId={targetId} initialState={friendState} />

          {canSeeLists && (
            <div className="flex items-center gap-6 text-[13px] text-white/60">
              <span>
                <b className="font-bold text-white">{watchedCount ?? 0}</b> visti
              </span>
              <span>
                <b className="font-bold text-white">{watching.length}</b> in corso
              </span>
            </div>
          )}
        </div>
      </header>

      {!canSeeLists ? (
        <div className="mx-5 mt-7 rounded-[20px] border border-border bg-surface p-6 text-center lg:mx-10">
          <p className="text-sm font-semibold">Profilo privato</p>
          <p className="mt-1 text-xs text-muted">
            Diventa amico di @{target.username} per vedere le sue liste.
          </p>
        </div>
      ) : (
        <div className="mt-7 space-y-7">
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
                  title={e.title?.title ?? ""}
                  posterPath={e.title?.poster_path ?? null}
                  rating={e.rating}
                  href={`/title/${e.media_type}/${e.title_id}`}
                />
              ))}
            </HorizontalShelf>
          )}
          {watching.length === 0 && watched.length === 0 && (
            <p className="px-5 text-center text-sm text-muted lg:px-10">
              Nessuna attività visibile.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
