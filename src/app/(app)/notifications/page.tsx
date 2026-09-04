import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { posterUrl } from "@/lib/config";
import { timeAgo } from "@/lib/format";
import { BackButton } from "@/components/layout/BackButton";
import { Avatar } from "@/components/social/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { MarkReadOnMount } from "./MarkReadOnMount";

export const metadata = { title: "Notifiche" };

/** Titolo citato in una notifica: solo quello che serve alla riga. */
interface TitleRef {
  id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
}

interface NotificationView {
  id: string;
  kind: string;
  text: ReactNode;
  href: string;
  createdAt: string;
  unread: boolean;
  senderName: string;
  senderAvatar: string | null;
  posterPath: string | null;
}

/** Icona 16px per tipo di notifica. */
function KindIcon({ kind }: { kind: string }) {
  const paths: Record<string, ReactNode> = {
    friend_request: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M19 8v6M22 11h-6" />
      </>
    ),
    friend_accepted: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="m16 11 2 2 4-4" />
      </>
    ),
    recommendation: (
      <path d="M12 2l2.94 6.26 6.87.86-5.06 4.73 1.3 6.79L12 17.27l-6.05 3.37 1.3-6.79L2.19 9.12l6.87-.86L12 2z" />
    ),
    comment: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z" />,
  };
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-accent-pale"
      aria-hidden="true"
    >
      {paths[kind] ?? paths.comment}
    </svg>
  );
}

function NotificationCard({ n }: { n: NotificationView }) {
  const poster = posterUrl(n.posterPath, "w92");
  return (
    <Link
      href={n.href}
      className={`flex items-center gap-3 rounded-[20px] border px-3.5 py-3 ${
        n.unread ? "border-accent/25 bg-[#121218]" : "border-border bg-surface"
      }`}
    >
      <div className="relative shrink-0">
        <Avatar url={n.senderAvatar} name={n.senderName} size={40} />
        <span className="absolute -bottom-1 -right-1.5 flex size-6 items-center justify-center rounded-full border-2 border-bg bg-surface">
          <KindIcon kind={n.kind} />
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p className={`text-sm leading-[1.35] ${n.unread ? "" : "text-white/70"}`}>
          {n.text}
        </p>
        <span className="text-[11px] text-muted">{timeAgo(n.createdAt)}</span>
      </div>
      {poster ? (
        <Image
          src={poster}
          alt=""
          width={34}
          height={51}
          className="h-[51px] w-[34px] shrink-0 rounded-[7px] object-cover"
        />
      ) : n.unread ? (
        <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      ) : null}
    </Link>
  );
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // profili e titoli citati nelle notifiche: una query ciascuno
  const userIds = new Set<string>();
  const titleIds = new Set<number>();
  for (const n of rows ?? []) {
    const payload = n.payload as { from_user?: string; title_id?: number } | null;
    if (payload?.from_user) userIds.add(payload.from_user);
    if (payload?.title_id) titleIds.add(payload.title_id);
  }

  const [{ data: profiles }, { data: titles }] = await Promise.all([
    userIds.size
      ? supabase
          .from("user_search")
          .select("id, username, display_name, avatar_url")
          .in("id", [...userIds])
      : Promise.resolve({ data: [] }),
    titleIds.size
      ? supabase
          .from("titles")
          .select("id, media_type, title, poster_path")
          .in("id", [...titleIds])
      : Promise.resolve({ data: [] }),
  ]);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const titleMap = new Map<string, TitleRef>(
    (titles ?? []).map((t) => [`${t.media_type}-${t.id}`, t]),
  );

  const items: NotificationView[] = (rows ?? []).map((n) => {
    const payload = n.payload as {
      from_user?: string;
      title_id?: number;
      media_type?: string;
      review_id?: string;
    } | null;
    const from = payload?.from_user ? profileMap.get(payload.from_user) : null;
    const name = from?.display_name ?? from?.username ?? "Qualcuno";
    const titleRow = payload?.title_id
      ? (titleMap.get(`${payload.media_type ?? "movie"}-${payload.title_id}`) ??
        titleMap.get(`tv-${payload.title_id}`) ??
        titleMap.get(`movie-${payload.title_id}`))
      : null;
    const who = <b className="font-semibold">{name}</b>;
    const what = titleRow ? <b className="font-semibold">{titleRow.title}</b> : null;

    let text: ReactNode;
    let href = "/friends";
    switch (n.kind) {
      case "friend_request":
        text = <>{who} ti ha inviato una richiesta di amicizia</>;
        href = "/friends";
        break;
      case "friend_accepted":
        text = <>{who} ha accettato la tua richiesta</>;
        href = from?.username ? `/u/${from.username}` : "/friends";
        break;
      case "recommendation":
        // stringa esistente ("ti ha consigliato un titolo") come fallback senza titolo
        text = what ? (
          <>
            {who} ti ha consigliato {what}
          </>
        ) : (
          <>{who} ti ha consigliato un titolo</>
        );
        href =
          payload?.title_id && payload.media_type
            ? `/title/${payload.media_type}/${payload.title_id}`
            : "/";
        break;
      case "comment":
        text = what ? (
          <>
            {who} ha commentato la tua recensione di {what}
          </>
        ) : (
          <>{who} ha commentato la tua recensione</>
        );
        href = "/";
        break;
      default:
        text = "Notifica";
    }
    return {
      id: n.id,
      kind: n.kind,
      text,
      href,
      createdAt: n.created_at,
      unread: n.read_at === null,
      senderName: name,
      senderAvatar: from?.avatar_url ?? null,
      posterPath: titleRow?.poster_path ?? null,
    };
  });

  const nuove = items.filter((i) => i.unread);
  const precedenti = items.filter((i) => !i.unread);

  return (
    <main className="relative pb-36">
      <MarkReadOnMount hasUnread={nuove.length > 0} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[140px] -top-[180px] h-[380px] w-[460px] rounded-full blur-[44px]"
        style={{
          background:
            "radial-gradient(circle, rgba(139,92,246,0.32) 0%, rgba(139,92,246,0.08) 45%, rgba(0,0,0,0) 70%)",
        }}
      />

      <header className="relative flex items-center gap-3.5 px-5 pt-[calc(env(safe-area-inset-top,0px)+40px)] lg:px-10">
        <BackButton inline />
        <h1 className="text-[34px] font-bold leading-none tracking-[-0.045em]">
          Notifiche
        </h1>
      </header>

      <div className="relative mt-7 px-5 lg:px-10">
        {items.length === 0 ? (
          <EmptyState title="Nessuna notifica" description="Tutto tranquillo per ora." />
        ) : (
          <div className="space-y-4">
            {nuove.length > 0 && (
              <section className="space-y-2">
                <h2 className="px-1 text-xs font-semibold text-accent-soft">Nuove</h2>
                <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0 xl:grid-cols-3">
                  {nuove.map((n) => (
                    <NotificationCard key={n.id} n={n} />
                  ))}
                </div>
              </section>
            )}
            {precedenti.length > 0 && (
              <section className="space-y-2">
                <h2 className="px-1 text-xs font-semibold text-muted">Precedenti</h2>
                <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0 xl:grid-cols-3">
                  {precedenti.map((n) => (
                    <NotificationCard key={n.id} n={n} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
