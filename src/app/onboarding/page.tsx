import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PosterWall } from "@/components/marketing/PosterWall";
import { getWallPosters } from "@/lib/tmdb/wall";
import { AvatarPicker } from "@/components/profile/AvatarPicker";
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
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-bg lg:mx-0 lg:grid lg:max-w-none lg:grid-cols-[55%_45%]">
      <div className="absolute inset-0 overflow-hidden lg:relative lg:inset-auto lg:col-start-1 lg:h-full">
        <PosterWall
          posters={posters}
          blur={10}
          opacity={0.45}
          height={520}
          className="lg:hidden"
        />
        {/* Desktop: 8 colonne larghe 1000px, così il muro copre tutta la colonna sinistra */}
        <PosterWall
          posters={posters}
          columns={8}
          width={1000}
          height={1600}
          className="hidden lg:block"
        />
        {/* Mobile: sfumatura più carica, ancorata al titolo */}
        <div
          className="absolute inset-x-0 top-0 h-[560px] lg:hidden"
          style={{
            background:
              "linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,.15) 18%,rgba(0,0,0,.55) 40%,rgba(0,0,0,.92) 62%,#000 78%)",
          }}
        />
        {/* Desktop: velo leggero, il muro resta nitido fino in fondo */}
        <div
          className="absolute inset-0 hidden lg:block"
          style={{
            background:
              "linear-gradient(180deg,rgba(0,0,0,.35) 0%,rgba(0,0,0,.05) 22%,rgba(0,0,0,.45) 62%,rgba(0,0,0,.82) 88%,rgba(0,0,0,.94) 100%)",
          }}
        />
        <div
          className="absolute -left-[100px] top-[120px] h-[340px] w-[460px] rounded-full blur-[44px]"
          style={{
            background:
              "radial-gradient(circle,rgba(139,92,246,.4) 0%,rgba(139,92,246,.12) 45%,transparent 70%)",
          }}
        />
        <div className="hidden lg:absolute lg:bottom-12 lg:left-12 lg:flex lg:flex-col lg:gap-2">
          <div className="text-[56px] font-bold leading-none tracking-[-0.05em] text-text">
            Zapp<span className="text-accent">.</span>
          </div>
          <p className="max-w-[300px] text-[17px] leading-[1.4] text-white/[0.72]">
            Film e serie, tutte le piattaforme, un&apos;unica app.
          </p>
        </div>
      </div>

      <div className="relative flex min-h-dvh flex-col lg:col-start-2 lg:items-center lg:justify-center lg:overflow-y-auto lg:px-10 lg:py-12">
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

        <BottomSheetStatic gap={22}>
          {/* Header desktop: dentro la card, la colonna sinistra mostra solo il wordmark */}
          <div className="hidden lg:flex lg:flex-col lg:gap-6">
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
                  Tocca per scegliere una foto. Puoi farlo anche dopo.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.04em] text-text">
                Scegli il tuo username<span className="text-accent">.</span>
              </h1>
              <p className="max-w-[340px] text-[15px] leading-[1.45] text-muted">
                Ti identificherà su Zapp: i tuoi amici ti troveranno così.
              </p>
            </div>
          </div>

          <OnboardingForm initialDisplayName={initialDisplayName} />
        </BottomSheetStatic>
      </div>
    </div>
  );
}
