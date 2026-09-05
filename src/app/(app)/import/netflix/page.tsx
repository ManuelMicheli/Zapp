import { BackButton } from "@/components/layout/BackButton";
import { ImportClient } from "./ImportClient";

export const metadata = { title: "Importa da Netflix" };

export default function NetflixImportPage() {
  return (
    <main className="relative px-5 pb-[150px] lg:px-10 lg:pb-36">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[140px] -top-[180px] h-[380px] w-[460px] rounded-full blur-[44px]"
        style={{
          background:
            "radial-gradient(circle, rgba(139,92,246,0.32) 0%, rgba(139,92,246,0.08) 45%, rgba(0,0,0,0) 70%)",
        }}
      />
      <header className="relative flex items-center gap-3.5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)]">
        <BackButton inline />
        <h1 className="text-[28px] font-bold leading-none tracking-[-0.045em]">
          Importa da Netflix
        </h1>
      </header>
      <div className="relative mt-7 lg:max-w-[720px]">
        <ImportClient />
      </div>
    </main>
  );
}
