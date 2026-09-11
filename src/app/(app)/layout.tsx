import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getViewerProfile } from "@/lib/auth/viewer";
import { TopNav } from "@/components/layout/TopNav";
import { NotificationsBell } from "@/components/social/NotificationsBell";
import { DailyQuestionLauncher } from "@/components/daily/DailyQuestionLauncher";
import { PageShell } from "@/components/layout/PageShell";
import { Toaster } from "@/components/ui/Toaster";
import { ImportProvider } from "@/components/import/ImportProvider";
import { ImportChip } from "@/components/import/ImportChip";
import { SignalsProvider } from "@/components/signals/SignalsProvider";
import { getPersonalizationEnabled } from "@/lib/taste/queries";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Entrambe riusano `getViewer()` tramite React cache e possono partire insieme.
  const [profile, segnaliAttivi] = await Promise.all([
    getViewerProfile(),
    getPersonalizationEnabled(),
  ]);
  if (!profile) redirect("/login");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  return (
    <PageShell>
      <Toaster>
        <SignalsProvider enabled={segnaliAttivi}>
          <ImportProvider>
            {children}
            <ImportChip />
            <TopNav
              right={
                <>
                  <Suspense fallback={null}>
                    <DailyQuestionLauncher />
                  </Suspense>
                  <Suspense fallback={null}>
                    <NotificationsBell />
                  </Suspense>
                </>
              }
            />
          </ImportProvider>
        </SignalsProvider>
      </Toaster>
    </PageShell>
  );
}
