import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getViewerProfile } from "@/lib/auth/viewer";
import { TopNav } from "@/components/layout/TopNav";
import { NotificationsBell } from "@/components/social/NotificationsBell";
import { PageShell } from "@/components/layout/PageShell";
import { Toaster } from "@/components/ui/Toaster";
import { ImportProvider } from "@/components/import/ImportProvider";
import { ImportChip } from "@/components/import/ImportChip";
import { SignalsProvider } from "@/components/signals/SignalsProvider";
import { getPersonalizationEnabled } from "@/lib/taste/queries";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // una sola lettura per richiesta (JWT verificato in locale + riga profilo),
  // condivisa con le pagine via React cache()
  const profile = await getViewerProfile();
  if (!profile) redirect("/login");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  // Il flag della personalizzazione: una query in più nel layout, ~5 ms in fra1.
  // Non si può mettere in parallelo con `getViewerProfile`, che porta l'id.
  const segnaliAttivi = await getPersonalizationEnabled();

  return (
    <PageShell>
      <Toaster>
        <SignalsProvider enabled={segnaliAttivi}>
          <ImportProvider>
            {children}
            <ImportChip />
            <TopNav
              right={
                <Suspense fallback={null}>
                  <NotificationsBell />
                </Suspense>
              }
            />
          </ImportProvider>
        </SignalsProvider>
      </Toaster>
    </PageShell>
  );
}
