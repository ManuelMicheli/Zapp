import Link from "next/link";
import { BackButton } from "@/components/layout/BackButton";
import { SourceMark } from "@/components/import/SourceMark";
import { SOURCE_LIST } from "@/lib/import/sources/registry";
import { getViewer } from "@/lib/auth/viewer";
import { getUserPlatforms } from "@/lib/platforms/user";
import { platformByKey } from "@/lib/platforms/catalog";

export const metadata = { title: "Importa i tuoi dati" };

/**
 * Congiunge i nomi come si fa in italiano: virgole fra tutti tranne l'ultimo,
 * "e" prima dell'ultimo. Stessa forma di `elencoItaliano` in `/benvenuto`: sono
 * due elenchi diversi (piattaforme senza export qui, piattaforme dichiarate là),
 * non vale la pena condividerli.
 */
function elencoNomi(nomi: string[]): string {
  if (nomi.length <= 1) return nomi[0] ?? "";
  return `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`;
}

export default async function ImportHubPage() {
  const viewer = await getViewer();
  const chiaviDichiarate = viewer ? await getUserPlatforms(viewer.id) : [];
  const nomiDichiarati = chiaviDichiarate
    .map((key) => platformByKey(key)?.pillola)
    .filter((nome): nome is string => nome != null);

  return (
    <main className="relative px-5 pb-[150px] md:px-8 lg:px-10 lg:pb-36">
      <div className="mx-auto max-w-[1360px]">
        <header className="relative flex items-center gap-3.5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:gap-5 lg:pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+40px)]">
          <BackButton inline />
          <div className="flex min-w-0 flex-col gap-1">
            <Link
              data-crumb
              href="/profile"
              className="text-[13px] font-medium text-accent-soft focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-pale"
            >
              Profilo
            </Link>
            <h1 className="text-[28px] font-bold leading-none tracking-[-0.045em] lg:text-[40px]">
              Importa i tuoi dati
            </h1>
          </div>
        </header>
        <p className="mt-4 text-pretty text-[15px] leading-[1.45] text-white/80 lg:mt-6 lg:max-w-[880px] lg:text-[17px]">
          Porta in Zapp quello che hai già visto altrove. Il file resta in memoria il
          tempo di leggerlo.
        </p>

        {nomiDichiarati.length > 0 && (
          <Link
            href="/benvenuto"
            className="mt-6 flex flex-col gap-1 rounded-[20px] border border-border bg-surface p-4 transition-opacity active:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-pale lg:mt-10 lg:max-w-[880px] lg:p-6"
          >
            <span className="text-[15px] font-semibold text-text lg:text-[17px]">
              Hai detto che guardi su {elencoNomi(nomiDichiarati)}
            </span>
            <span className="text-[13px] leading-relaxed text-muted lg:text-sm">
              Recupera lì la tua cronologia.
            </span>
          </Link>
        )}

        <div className="mt-6 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:mt-10 lg:grid-cols-4 lg:gap-5">
          {SOURCE_LIST.map((source) => (
            <Link
              key={source.slug}
              href={`/import/${source.slug}`}
              className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-4 transition-opacity active:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-pale lg:min-h-[190px] lg:gap-5 lg:p-6"
            >
              <span className="lg:hidden">
                <SourceMark slug={source.slug} size={44} />
              </span>
              <span className="hidden lg:block">
                <SourceMark slug={source.slug} size={56} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold lg:text-[18px]">
                  {source.nome}
                </span>
                <span className="text-xs leading-relaxed text-muted lg:text-sm">
                  {source.descrizione}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
