import Image from "next/image";
import Link from "next/link";
import { TMDB_IMAGE_BASE } from "@/lib/config";
import { chiccaFor, splitAroundQuote } from "@/lib/easter-eggs/find";
import { getPerson } from "@/lib/tmdb/client";

/**
 * La chicca del titolo: la recensione firmata dal personaggio che, dentro
 * un'altra opera, parla proprio di questo film (vedi `src/lib/easter-eggs/data.ts`).
 *
 * È una recensione normale, identica alle altre — avatar, nome, voto, corpo —
 * senza etichette né icone che la marchino (scelta utente): a dire che non è un
 * utente in carne e ossa basta la firma in fondo, "detto in <opera>", che è anche
 * il link alla sua scheda. La battuta davvero pronunciata è l'unico pezzo in
 * evidenza: il contorno lo abbiamo scritto noi in voce del personaggio.
 *
 * Sta in fondo alla scheda, senza titolo di sezione: è una cosa che si trova
 * scorrendo. Titolo senza chicche → non rende niente. La faccia dell'avatar è
 * quella dell'interprete (`person/{id}`, cache 30 g, una sola chiamata TMDB e
 * solo quando la chicca esiste davvero).
 */
export async function TitleTrivia({
  mediaType,
  tmdbId,
}: {
  mediaType: "movie" | "tv";
  tmdbId: number;
}) {
  const chicca = chiccaFor(mediaType, tmdbId);
  if (!chicca) return null;

  const person = chicca.speaker.personId
    ? await getPerson(chicca.speaker.personId).catch(() => null)
    : null;
  const face = person?.profile_path
    ? `${TMDB_IMAGE_BASE}/w185${person.profile_path}`
    : null;

  const { speaker, source } = chicca;
  const parts = splitAroundQuote(chicca.review, chicca.quote);
  const href = `/title/${source.mediaType}/${source.tmdbId}`;

  return (
    <section aria-label="Chicca" className="px-5 md:px-0">
      <article className="flex flex-col gap-2.5 rounded-[20px] border border-border bg-surface p-3.5">
        <header className="flex items-center gap-2.5">
          <div className="relative size-8 shrink-0 overflow-hidden rounded-full border border-white/[0.08] bg-surface-2">
            {face ? (
              <Image
                src={face}
                alt=""
                fill
                sizes="32px"
                className="object-cover object-[50%_20%]"
              />
            ) : (
              <span className="flex h-full items-center justify-center bg-gradient-to-br from-accent-soft to-accent-strong text-sm font-bold text-bg">
                {speaker.name.charAt(0)}
              </span>
            )}
          </div>

          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{speaker.name}</p>

          <span className="shrink-0 text-sm font-bold text-accent-soft">
            ★ {chicca.rating}
          </span>
        </header>

        <p className="text-sm leading-[1.5] text-white/55">
          {parts ? (
            <>
              {parts[0]}
              <span className="font-medium text-white/90">{parts[1]}</span>
              {parts[2]}
            </>
          ) : (
            chicca.review
          )}
        </p>

        <footer>
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-soft"
          >
            <span className="text-muted">detto in</span>
            {source.label}
            {source.detail && <span className="text-muted">· {source.detail}</span>}
            <Arrow />
          </Link>
        </footer>
      </article>
    </section>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3.5" aria-hidden>
      <path
        d="M5 12h14m0 0l-5.5-5.5M19 12l-5.5 5.5"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
