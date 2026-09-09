import Link from "next/link";
import { BackButton } from "@/components/layout/BackButton";
import { ConnectButton } from "../ConnectButton";

export const metadata = { title: "Collega questo browser" };

/**
 * La scheda che l'estensione apre da sola dopo l'installazione. Una sola
 * cosa da fare in pagina, niente elenco dispositivi.
 */
export default function DevicesConnectPage() {
  return (
    <main className="relative pb-16">
      <header className="relative flex items-center gap-3.5 px-5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
        <BackButton inline />
        <h1 className="text-[28px] font-bold leading-none tracking-[-0.045em]">
          Collega questo browser
        </h1>
      </header>

      <div className="relative mt-7 flex flex-col gap-5 px-5 lg:max-w-[560px] lg:px-10">
        <p className="text-[15px] leading-relaxed text-muted">
          Da qui in avanti quello che guardi su Netflix in questo browser arriva da solo
          nella tua libreria. Zapp legge il titolo, l&rsquo;episodio e a che punto sei:
          mai le tue password, mai le altre schede.
        </p>
        <ConnectButton />
        <Link href="/devices" className="text-[13px] text-accent-soft">
          Vedi tutti i dispositivi collegati
        </Link>
      </div>
    </main>
  );
}
