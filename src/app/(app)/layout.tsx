import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/layout/BottomNav";
import { FloatingNav } from "@/components/layout/FloatingNav";
import { PageShell } from "@/components/layout/PageShell";
import { Toaster } from "@/components/ui/Toaster";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarding_completed_at) redirect("/onboarding");

  return (
    <PageShell>
      <Toaster>
        {children}
        <BottomNav />
        <FloatingNav />
      </Toaster>
    </PageShell>
  );
}
