import { BackButton } from "@/components/layout/BackButton";
import { normalizzaIp } from "@/lib/devices/listeners";
import { TvTrackingGuide } from "./TvTrackingGuide";

export const metadata = { title: "Attiva il tracciamento completo" };

/**
 * La pagina a cui manda la schermata "Manca un permesso" delle app TV.
 *
 * L'indirizzo della TV puo' arrivare gia' nella query (`?ip=192.168.1.221`):
 * si valida qui, cosi' un valore storto non finisce dentro un comando da
 * incollare in un terminale.
 */
export default async function DevicesConnectTvPage({
  searchParams,
}: {
  searchParams: Promise<{ ip?: string }>;
}) {
  const { ip } = await searchParams;
  const ipIniziale = normalizzaIp(ip ?? "") ?? "";

  return (
    <main className="relative pb-16">
      <header className="relative flex items-center gap-3.5 px-5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
        <BackButton inline />
        <h1 className="text-[28px] font-bold leading-none tracking-[-0.045em]">
          Attiva il tracciamento completo
        </h1>
      </header>

      <div className="relative mx-auto mt-7 max-w-[860px] px-5 lg:px-10">
        <p className="max-w-[640px] text-[15px] leading-relaxed text-muted">
          Sulla Fire TV, Zapp riconosce da solo cosa stai guardando su NOW e Disney+ solo
          se l&rsquo;app ha l&rsquo;
          <strong className="text-text">accesso alle notifiche</strong>. Quel permesso su
          Fire OS non ha una schermata: si concede una volta sola da un computer sulla
          stessa rete, con i comandi qui sotto.
        </p>
        <div className="mt-8">
          <TvTrackingGuide ipIniziale={ipIniziale} />
        </div>
      </div>
    </main>
  );
}
