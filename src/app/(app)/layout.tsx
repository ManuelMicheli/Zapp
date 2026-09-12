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
import { NativeBridge } from "@/components/native/NativeBridge";
import { SignalsProvider } from "@/components/signals/SignalsProvider";
import { getPersonalizationEnabled } from "@/lib/taste/queries";
import { getConsensi } from "@/lib/legal/queries";
import { consensiMancanti } from "@/lib/legal/versions";
import { ConsentGate } from "@/components/legal/ConsentGate";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Tutte e tre riusano `getViewer()` tramite React cache e partono insieme:
  // il gate dei consensi non costa un round trip in più.
  const [profile, segnaliAttivi, consensi] = await Promise.all([
    getViewerProfile(),
    getPersonalizationEnabled(),
    getConsensi(),
  ]);
  if (!profile) redirect("/login");
  if (!profile.onboarding_completed_at) redirect("/onboarding");

  // Mancano termini o informativa (utente iscritto prima della loro esistenza, o
  // testo aggiornato dopo la sua accettazione): niente app finché non accetta.
  if (consensiMancanti(consensi).length > 0) {
    return (
      <PageShell>
        <ConsentGate />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Toaster>
        <SignalsProvider enabled={segnaliAttivi}>
          <ImportProvider>
            {children}
            <ImportChip />
            <NativeBridge />
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
