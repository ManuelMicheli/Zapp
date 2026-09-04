import { TopBar } from "@/components/layout/TopBar";
import { FriendsStrip } from "@/components/social/FriendsStrip";
import { InviteCard } from "@/components/social/InviteCard";
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

  const inviteUrl = me
    ? `${process.env.NEXT_PUBLIC_APP_URL}/signup?ref=${me.username}`
    : "";
  const noFriendsAndFeed = friends.length === 0 && feed.items.length === 0;

  return (
    <>
      <TopBar title="Amici" action={<NotificationsBell />} />
      <main className="px-5 pb-36 md:grid md:grid-cols-[minmax(0,1fr)_300px] md:items-start md:gap-8 md:px-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10 lg:px-10">
        {/* colonna destra su desktop: ricerca, richieste, fila amici */}
        <div className="flex flex-col gap-[26px] md:col-start-2 md:row-start-1">
          <UserSearch />

          {incoming.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h2 className="flex items-center gap-2 text-xl font-bold tracking-[-0.03em]">
                Richieste ricevute
                <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-accent px-[7px] text-xs font-bold text-white">
                  {incoming.length}
                </span>
              </h2>
              <div className="flex flex-col gap-2.5">
                {incoming.map((p) => (
                  <RequestRow key={p.id} profile={p} />
                ))}
              </div>
            </section>
          )}

          {friends.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h2 className="flex items-baseline gap-2 text-xl font-bold tracking-[-0.03em]">
                I tuoi amici <span className="text-sm text-muted">{friends.length}</span>
              </h2>
              <FriendsStrip friends={friends} />
            </section>
          )}
        </div>

        {/* colonna sinistra su desktop: il feed, largo */}
        <section className="mt-[26px] flex flex-col gap-2.5 md:col-start-1 md:row-span-2 md:row-start-1 md:mt-0">
          <h2 className="text-xl font-bold tracking-[-0.03em]">Attività degli amici</h2>
          {noFriendsAndFeed ? (
            <InviteCard inviteUrl={inviteUrl} username={me?.username ?? ""} />
          ) : feed.items.length === 0 ? (
            <div className="rounded-[20px] border border-border bg-surface p-6 text-center">
              <p className="text-sm font-semibold">Nessuna attività recente</p>
              <p className="mt-1 text-xs text-muted">
                Quando i tuoi amici guardano qualcosa, lo vedrai qui.
              </p>
            </div>
          ) : (
            <FeedList initialItems={feed.items} initialCursor={feed.nextCursor} />
          )}
        </section>
      </main>
    </>
  );
}
