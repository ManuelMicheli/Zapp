import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { MarkReadOnMount } from "./MarkReadOnMount";

export const metadata = { title: "Notifiche" };

interface NotificationView {
  id: string;
  text: string;
  href: string;
  createdAt: string;
  unread: boolean;
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

  // profili citati nelle notifiche, una query
  const userIds = new Set<string>();
  for (const n of rows ?? []) {
    const from = (n.payload as { from_user?: string } | null)?.from_user;
    if (from) userIds.add(from);
  }
  const { data: profiles } = userIds.size
    ? await supabase
        .from("user_search")
        .select("id, username, display_name")
        .in("id", [...userIds])
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const items: NotificationView[] = (rows ?? []).map((n) => {
    const payload = n.payload as {
      from_user?: string;
      title_id?: number;
      media_type?: string;
      review_id?: string;
    } | null;
    const from = payload?.from_user ? profileMap.get(payload.from_user) : null;
    const name = from?.display_name ?? from?.username ?? "Qualcuno";
    let text = "";
    let href = "/friends";
    switch (n.kind) {
      case "friend_request":
        text = `${name} ti ha inviato una richiesta di amicizia`;
        href = "/friends";
        break;
      case "friend_accepted":
        text = `${name} ha accettato la tua richiesta`;
        href = from?.username ? `/u/${from.username}` : "/friends";
        break;
      case "recommendation":
        text = `${name} ti ha consigliato un titolo`;
        href =
          payload?.title_id && payload.media_type
            ? `/title/${payload.media_type}/${payload.title_id}`
            : "/";
        break;
      case "comment":
        text = `${name} ha commentato la tua recensione`;
        href = "/";
        break;
      default:
        text = "Notifica";
    }
    return { id: n.id, text, href, createdAt: n.created_at, unread: n.read_at === null };
  });

  return (
    <>
      <TopBar title="Notifiche" />
      <MarkReadOnMount hasUnread={items.some((i) => i.unread)} />
      <main className="px-4 pb-28 lg:px-6">
        {items.length === 0 ? (
          <EmptyState title="Nessuna notifica" description="Tutto tranquillo per ora." />
        ) : (
          <div className="space-y-1.5 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0 xl:grid-cols-3">
            {items.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                className={`block rounded-xl border border-border p-3 text-sm ${
                  n.unread ? "bg-surface-2 font-medium" : "bg-surface text-muted"
                }`}
              >
                {n.text}
                <span className="ml-2 text-xs text-muted">
                  {new Date(n.createdAt).toLocaleDateString("it-IT", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
