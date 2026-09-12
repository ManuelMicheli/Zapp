import Link from "next/link";
import { BackButton } from "@/components/layout/BackButton";
import { SOURCE_LIST } from "@/lib/import/sources/registry";

export const metadata = { title: "Importa i tuoi dati" };

export default function ImportHubPage() {
  return (
    <main className="relative px-5 pb-[150px] lg:px-10 lg:pb-36">
      <header className="relative flex items-center gap-3.5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)]">
        <BackButton inline />
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            data-crumb
            href="/profile"
            className="text-[13px] font-medium text-accent-soft"
          >
            Profilo
          </Link>
          <h1 className="text-[28px] font-bold leading-none tracking-[-0.045em]">
            Importa i tuoi dati
          </h1>
        </div>
      </header>
      <p className="mt-4 text-pretty text-[15px] leading-[1.45] text-white/80 lg:max-w-[720px]">
        Porta in Zapp quello che hai già visto altrove. Il file resta in memoria il tempo
        di leggerlo.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:max-w-[720px]">
        {SOURCE_LIST.map((source) => (
          <Link
            key={source.slug}
            href={`/import/${source.slug}`}
            className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-4 transition-opacity active:opacity-60"
          >
            <span
              aria-hidden="true"
              className="flex size-11 items-center justify-center rounded-[13px] text-lg font-extrabold leading-none text-white"
              style={{ background: source.colore }}
            >
              {source.sigla}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{source.nome}</span>
              <span className="text-xs leading-relaxed text-muted">
                {source.descrizione}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
