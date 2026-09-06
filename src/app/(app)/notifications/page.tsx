import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { timeAgo } from "@/lib/format";
import { BackButton } from "@/components/layout/BackButton";
import { ActivityBanner } from "@/components/social/ActivityBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { MarkReadOnMount } from "./MarkReadOnMount";

export const metadata = { title: "Notifiche" };

/** Titolo citato in una notifica: solo quello che serve alla riga. */
interface TitleRef {
  id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
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
  backdropPath: string | null;
}

/** Icona del tipo di notifica: 16px nella pillola, grande in filigrana. */
function KindIcon({ kind, size = 16 }: { kind: string; size?: number }) {
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
    like: (
      <path d="M20.8 6.6a5 5 0 0 0-7.1 0L12 8.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z" />
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-current"
      aria-hidden="true"
    >
      {paths[kind] ?? paths.comment}
    </svg>
  );
}

function NotificationCard({ n }: { n: NotificationView }) {
  return (
    <ActivityBanner
      href={n.href}
      backdropPath={n.backdropPath}
      posterPath={n.posterPath}
      avatarUrl={n.senderAvatar}
      avatarName={n.senderName}
      text={n.text}
      time={timeAgo(n.createdAt)}
      highlight={n.unread}
      glyph={<KindIcon kind={n.kind} size={96} />}
      action={
        <span
          className={`glass flex size-9 items-center justify-center rounded-full lg:size-10 ${
            n.unread ? "text-accent-pale" : "text-white/70"
          }`}
        >
          <KindIcon kind={n.kind} size={18} />
        </span>
      }
    />
  );
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const user = await getViewer();
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
          .select("id, media_type, title, poster_path, backdrop_path")
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
      case "like":
        text = what ? (
          <>
            {who} ha messo mi piace alla tua attività su {what}
          </>
        ) : (
          <>{who} ha messo mi piace a una tua attività</>
        );
        href =
          payload?.title_id && payload.media_type
            ? `/title/${payload.media_type}/${payload.title_id}`
            : "/friends";
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
      backdropPath: titleRow?.backdrop_path ?? null,
    };
  });

  const nuove = items.filter((i) => i.unread);
  const precedenti = items.filter((i) => !i.unread);

  return (
    <main className="relative pb-16">
      <MarkReadOnMount hasUnread={nuove.length > 0} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[140px] -top-[180px] h-[380px] w-[460px] rounded-full blur-[44px]"
        style={{
          background:
            "radial-gradient(circle, rgba(139,92,246,0.32) 0%, rgba(139,92,246,0.08) 45%, rgba(0,0,0,0) 70%)",
        }}
      />

      <header className="relative flex items-center gap-3.5 px-5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
        <BackButton inline />
        <h1 className="text-[34px] font-bold leading-none tracking-[-0.045em]">
          Notifiche
        </h1>
      </header>

      <div className="relative mt-7 px-5 lg:px-10">
        {items.length === 0 ? (
          <EmptyState title="Nessuna notifica" description="Tutto tranquillo per ora." />
        ) : (
          <div className="space-y-6">
            {nuove.length > 0 && (
              <section className="space-y-2.5">
                <h2 className="px-1 text-xs font-semibold text-accent-soft lg:text-sm">
                  Nuove
                </h2>
                <div className="grid gap-3 md:grid-cols-2 lg:gap-4 min-[1800px]:grid-cols-3">
                  {nuove.map((n) => (
                    <NotificationCard key={n.id} n={n} />
                  ))}
                </div>
              </section>
            )}
            {precedenti.length > 0 && (
              <section className="space-y-2.5">
                <h2 className="px-1 text-xs font-semibold text-muted lg:text-sm">
                  Precedenti
                </h2>
                <div className="grid gap-3 md:grid-cols-2 lg:gap-4 min-[1800px]:grid-cols-3">
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
