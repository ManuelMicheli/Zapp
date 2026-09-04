import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWallPosters } from "@/lib/tmdb/wall";
import { AvatarPicker } from "@/components/profile/AvatarPicker";
import { AuthShell } from "@/components/auth/AuthShell";
import { BottomSheetStatic } from "@/components/layout/BottomSheetStatic";
import { OnboardingForm } from "./OnboardingForm";

export const metadata = { title: "Benvenuto" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at, display_name, avatar_url")
    .eq("id", user.id)
    .single();

  if (profile?.onboarding_completed_at) redirect("/");

  const posters = await getWallPosters();
  const initialDisplayName = profile?.display_name ?? "";
  const initialAvatarUrl = profile?.avatar_url ?? null;

  return (
    <AuthShell posters={posters}>
      {/* Header mobile: foto profilo + titolo, nel flusso sopra il foglio (nascosto da lg).
          flex-1 + justify-end: occupa lo spazio residuo così il testo resta sempre appena
          sopra il foglio, anche su viewport bassi, senza mai sovrapporlo. */}
      <div className="relative flex flex-1 flex-col justify-end gap-[22px] px-6 pb-6 lg:hidden">
        {/* Bagliore nero dietro il blocco titolo: le locandine non devono trasparire dal testo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-16 bottom-0 bg-[radial-gradient(ellipse_at_left,rgba(0,0,0,.85),transparent_70%)]"
        />
        <div className="relative flex items-center gap-[18px]">
          <AvatarPicker
            userId={user.id}
            initialUrl={initialAvatarUrl}
            name={initialDisplayName || "?"}
            size={92}
          />
          <div className="flex flex-col gap-1">
            <p className="text-[15px] font-semibold text-text">Foto profilo</p>
            <p className="max-w-[190px] text-[13px] leading-[1.4] text-white/60">
              Tocca per scegliere una foto. Puoi farlo anche dopo.
            </p>
          </div>
        </div>
        <div className="relative flex flex-col gap-2.5">
          <h1 className="text-4xl font-bold leading-[1.05] tracking-[-0.045em] text-text">
            Scegli il tuo username<span className="text-accent">.</span>
          </h1>
          <p className="max-w-[300px] text-[16px] leading-[1.45] text-white/[0.72]">
            Ti identificherà su Zapp: i tuoi amici ti troveranno così.
          </p>
        </div>
      </div>

      {/* Header desktop: intestazione del pannello destro (75/25 come login/signup) */}
      <div className="hidden flex-col gap-7 lg:flex">
        <div className="flex items-center gap-4">
          <AvatarPicker
            userId={user.id}
            initialUrl={initialAvatarUrl}
            name={initialDisplayName || "?"}
            size={72}
          />
          <div className="flex flex-col gap-1">
            <p className="text-[15px] font-semibold text-text">Foto profilo</p>
            <p className="max-w-[220px] text-[13px] leading-[1.4] text-muted">
              Clicca per scegliere una foto. Puoi farlo anche dopo.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <h1 className="text-[36px] font-bold leading-[1.05] tracking-[-0.045em] text-text 2xl:text-[44px]">
            Scegli il tuo username<span className="text-accent">.</span>
          </h1>
          <p className="max-w-[340px] text-[16px] leading-[1.45] text-muted 2xl:max-w-[400px] 2xl:text-[18px]">
            Ti identificherà su Zapp: i tuoi amici ti troveranno così.
          </p>
        </div>
      </div>

      <BottomSheetStatic gap={22} desktop="plain">
        <OnboardingForm initialDisplayName={initialDisplayName} />
      </BottomSheetStatic>
    </AuthShell>
  );
}
