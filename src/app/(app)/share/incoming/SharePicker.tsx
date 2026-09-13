import Link from "next/link";
import { PosterCard } from "@/components/ui/PosterCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ShareOption } from "@/lib/share/resolve";

/**
 * Le tre facce della pagina "Condividi in Zapp" quando non si e' potuto aprire
 * direttamente una scheda. Sono componenti server: qui dentro non succede
 * niente che richieda il browser, solo link.
 */

/** Percorso della ricerca, con la query gia' scritta nella barra se ce n'e' una. */
export function searchHref(query: string | null): string {
  return query ? `/search?q=${encodeURIComponent(query)}` : "/search";
}

function Testata({ titolo, sottotitolo }: { titolo: string; sottotitolo?: string }) {
  return (
    <header className="px-5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
      <h1 className="text-[34px] font-bold leading-none tracking-[-0.045em]">{titolo}</h1>
      {sottotitolo && <p className="mt-2 text-sm text-muted">{sottotitolo}</p>}
    </header>
  );
}

export function SharePicker({
  query,
  options,
}: {
  query: string;
  options: ShareOption[];
}) {
  return (
    <main className="relative pb-16">
      <Testata titolo="Quale intendevi?" sottotitolo={`Hai condiviso “${query}”.`} />
      <div className="mx-auto mt-8 max-w-[1120px] px-5 lg:px-10">
        <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
          {options.map((option) => (
            <li key={`${option.mediaType}:${option.id}`}>
              <PosterCard
                title={option.title}
                posterPath={option.posterPath}
                year={option.year === null ? null : String(option.year)}
                reason={option.mediaType === "movie" ? "Film" : "Serie"}
                href={`/title/${option.mediaType}/${option.id}?from=share`}
                sizes="(max-width: 640px) 30vw, (max-width: 1024px) 22vw, 170px"
              />
            </li>
          ))}
        </ul>
        <p className="mt-8 text-center text-sm text-muted">
          Non e&rsquo; qui?{" "}
          <Link href={searchHref(query)} className="font-semibold text-accent-light">
            Cerca in Zapp
          </Link>
        </p>
      </div>
    </main>
  );
}

export function ShareNotFound({ query }: { query: string | null }) {
  return (
    <main className="relative pb-16">
      <Testata titolo="Condividi in Zapp" />
      <div className="mx-auto mt-8 max-w-[560px] px-5 lg:px-10">
        <EmptyState
          title="Non ho riconosciuto il titolo"
          description={
            query
              ? `Da “${query}” non sono arrivato a nessuna scheda. Prova a cercarlo.`
              : "Il link che hai condiviso non porta a un film o a una serie che conosco."
          }
          action={
            <Link
              href={searchHref(query)}
              className="glass-accent inline-flex h-[54px] items-center justify-center rounded-full px-6 text-[17px] font-semibold text-white"
            >
              Cerca in Zapp
            </Link>
          }
        />
      </div>
    </main>
  );
}

export function ShareLimit() {
  return (
    <main className="relative pb-16">
      <Testata titolo="Condividi in Zapp" />
      <div className="mx-auto mt-8 max-w-[560px] px-5 lg:px-10">
        <EmptyState
          title="Troppe condivisioni"
          description="Riprova fra un minuto."
          action={
            <Link
              href="/search"
              className="glass inline-flex h-[54px] items-center justify-center rounded-full px-6 text-[17px] font-semibold"
            >
              Cerca in Zapp
            </Link>
          }
        />
      </div>
    </main>
  );
}
