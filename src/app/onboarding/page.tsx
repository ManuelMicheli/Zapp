import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    .select("onboarding_completed_at, display_name")
    .eq("id", user.id)
    .single();

  if (profile?.onboarding_completed_at) redirect("/");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold">Scegli il tuo username</h1>
      <p className="mt-2 text-sm text-muted">
        Ti identificherà su Zapp: i tuoi amici ti troveranno così.
      </p>
      <div className="mt-8">
        <OnboardingForm initialDisplayName={profile?.display_name ?? ""} />
      </div>
    </div>
  );
}
