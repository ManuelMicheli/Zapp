import Link from "next/link";
import { BackButton } from "@/components/layout/BackButton";
import { getConsensi } from "@/lib/legal/queries";
import { haConsenso } from "@/lib/legal/versions";
import { ScrobbleConsent } from "@/components/legal/ScrobbleConsent";
import { AndroidScrobbleClient } from "./AndroidScrobbleClient";

export const metadata = { title: "Telefono Android" };

/**
 * Pagina che spiega e attiva il riconoscimento automatico sul telefono
 * Android: legge le notifiche di Netflix, Prime Video, Disney+ e NOW dentro
 * l'app Zapp (non nel browser), mai le credenziali né i contenuti.
 */
export default async function DevicesConnectAndroidPage() {
  const consensi = await getConsensi();
  const puoRegistrare = haConsenso(consensi, "scrobble");

  return (
    <main className="relative pb-16">
      <header className="relative flex items-center gap-3.5 px-5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
        <BackButton inline />
        <h1 className="text-[28px] font-bold leading-none tracking-[-0.045em]">
          Riconosci cosa guardi sul telefono
        </h1>
      </header>

      <div className="relative mt-7 flex flex-col gap-5 px-5 lg:max-w-[560px] lg:px-10">
        <p className="text-[15px] leading-relaxed text-muted">
          Con l&rsquo;app Zapp per Android installata, guardare Netflix, Prime Video,
          Disney+ o NOW aggiorna da solo la tua libreria: niente da segnare a mano. Zapp
          non legge mai le tue password né i contenuti che guardi — Netflix e Prime Video
          non dicono nemmeno a noi il titolo, quindi Zapp te lo chiede o lo deduce da cosa
          hai avviato da Zapp stesso. Serve il permesso di sistema &ldquo;Accesso alle
          notifiche&rdquo;, e vale solo dentro l&rsquo;app Zapp per Android: nel browser
          del telefono non succede niente.
        </p>
        {puoRegistrare ? <AndroidScrobbleClient /> : <ScrobbleConsent />}
        <Link href="/devices" className="text-[13px] text-accent-soft">
          Torna ai dispositivi
        </Link>
      </div>
    </main>
  );
}
