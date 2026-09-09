import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { BackButton } from "@/components/layout/BackButton";
import { DevicesClient, type Device } from "./DevicesClient";

export const metadata = { title: "Dispositivi" };

/**
 * Server Component: legge i dispositivi dell'utente (join `device_members` →
 * `devices`, entrambe protette da RLS: `device_members_own` e
 * `devices_select_members`) e passa tutto al client.
 */
export default async function DevicesPage() {
  const viewer = await getViewer();
  const supabase = await createClient();

  const { data } = viewer
    ? await supabase
        .from("device_members")
        .select("device_id, paused_until, devices(id, name, platform, last_seen_at)")
        .eq("user_id", viewer.id)
    : { data: null };

  const devices: Device[] = (data ?? []).map((row) => ({
    id: row.device_id,
    name: row.devices?.name ?? "Dispositivo",
    platform: row.devices?.platform ?? "browser_ext",
    lastSeenAt: row.devices?.last_seen_at ?? null,
    pausedUntil: row.paused_until,
  }));

  return (
    <main className="relative pb-16">
      <header className="relative flex items-center gap-3.5 px-5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
        <BackButton inline />
        <h1 className="text-[34px] font-bold leading-none tracking-[-0.045em]">
          Dispositivi
        </h1>
      </header>

      <div className="relative mt-7 px-5 lg:px-10">
        <DevicesClient devices={devices} />
      </div>
    </main>
  );
}
