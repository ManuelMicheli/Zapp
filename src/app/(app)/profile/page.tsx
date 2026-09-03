import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { LogoutButton } from "./LogoutButton";

export const metadata = { title: "Profilo" };

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", user.id)
    .single();

  return (
    <>
      <TopBar title="Profilo" />
      <main className="flex min-h-[60dvh] flex-col px-4 pb-28">
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5">
          <div className="flex size-16 items-center justify-center rounded-full bg-surface-2 text-2xl font-bold text-accent">
            {(profile?.display_name ?? profile?.username ?? "?")
              .charAt(0)
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">
              {profile?.display_name ?? profile?.username}
            </p>
            <p className="truncate text-sm text-muted">@{profile?.username}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>

        <div className="mt-6">
          <LogoutButton />
        </div>

        <footer className="mt-auto pt-16 text-center text-[11px] leading-relaxed text-muted">
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.
        </footer>
      </main>
    </>
  );
}
