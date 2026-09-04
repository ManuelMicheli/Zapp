import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { Avatar } from "@/components/social/Avatar";
import { NotificationsBell } from "@/components/social/NotificationsBell";
import { UserSearch } from "./UserSearch";
import { FeedList } from "./FeedList";
import { RequestRow } from "./RequestRow";
import { getFeed, getFriendsData } from "@/lib/social/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Amici" };

export default async function FriendsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = user
    ? await supabase.from("profiles").select("username").eq("id", user.id).single()
    : { data: null };

  const [{ friends, incoming }, feed] = await Promise.all([
    getFriendsData(),
    getFeed(null),
  ]);

  return (
    <>
      <TopBar title="Amici" action={<NotificationsBell />} />
      <main className="pb-36 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-10 lg:px-6">
        {/* colonna destra su desktop: ricerca + richieste */}
        <div className="lg:col-start-2 lg:row-start-1">
        <div className="px-4">
          <UserSearch />
        </div>

        {incoming.length > 0 && (
          <section className="mt-5 px-4">
            <h2 className="mb-2 text-base font-bold">
              Richieste ricevute{" "}
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-white">
                {incoming.length}
              </span>
            </h2>
            <div className="space-y-2">
              {incoming.map((p) => (
                <RequestRow key={p.id} profile={p} />
              ))}
            </div>
          </section>
        )}
        </div>

        {/* colonna sinistra su desktop: il feed, largo */}
        <section className="mt-5 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mt-0">
          <h2 className="mb-2 px-4 text-base font-bold">Attività degli amici</h2>
          {feed.items.length === 0 ? (
            <div className="mx-4 rounded-2xl border border-border bg-surface p-6 text-center">
              <p className="text-sm font-semibold">
                {friends.length === 0
                  ? "Non hai ancora amici su Zapp"
                  : "Nessuna attività recente"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {friends.length === 0
                  ? "Cerca i tuoi amici per username qui sopra, o invitali con il tuo link."
                  : "Quando i tuoi amici guardano qualcosa, lo vedrai qui."}
              </p>
              {friends.length === 0 && me && (
                <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
                  Link invito:{" "}
                  <span className="select-all font-mono text-accent">
                    {process.env.NEXT_PUBLIC_APP_URL}/signup?ref={me.username}
                  </span>
                </p>
              )}
            </div>
          ) : (
            <FeedList initialItems={feed.items} initialCursor={feed.nextCursor} />
          )}
        </section>

        {friends.length > 0 && (
          <section className="mt-6 px-4 lg:col-start-2 lg:row-start-2 lg:mt-5">
            <h2 className="mb-2 text-base font-bold">
              I tuoi amici <span className="text-muted">· {friends.length}</span>
            </h2>
            <div className="space-y-1.5">
              {friends.map((f) => (
                <Link
                  key={f.id}
                  href={`/u/${f.username}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5 hover:bg-surface-2"
                >
                  <Avatar url={f.avatar_url} name={f.display_name ?? f.username} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {f.display_name ?? f.username}
                    </p>
                    <p className="truncate text-xs text-muted">@{f.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
