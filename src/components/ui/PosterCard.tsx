import Image from "next/image";
import Link from "next/link";
import { posterUrl, providerLogoUrl } from "@/lib/config";
import { formatScore, formatVotes } from "@/lib/ratings/format";
import { signalAttr, targetFromHref, type Surface } from "@/lib/taste/surfaces";

/**
 * Misura delle copertine negli scaffali orizzontali. Su desktop 140px erano una
 * miniatura in mezzo a una pagina larga: la card cresce a scalini fino a 210px
 * (scelta utente 2026-09-07).
 */
export const SHELF_CARD_CLASS =
  "w-28 shrink-0 md:w-36 lg:w-[172px] xl:w-48 2xl:w-[210px]";
/**
 * `sizes` che segue quegli scalini: senza, il loader TMDB si ferma alla taglia della
 * card piccola e su desktop le copertine sono sgranate.
 */
export const SHELF_CARD_SIZES =
  "(max-width: 480px) 33vw, (max-width: 767px) 112px, (max-width: 1023px) 144px, (max-width: 1279px) 172px, (max-width: 1535px) 192px, 210px";

export interface PosterCardProvider {
  id: number;
  name: string;
  logoPath: string | null;
}

export function PosterCard({
  title,
  posterPath,
  year,
  rating,
  votes = null,
  userRating = null,
  userRatingLabel = "tuo",
  reason = null,
  affinity = null,
  showNoRating = false,
  providers = [],
  href,
  preview = false,
  signal = null,
  className = "",
  chartBadge = null,
  sizes = "(max-width: 480px) 33vw, 160px",
}: {
  title: string;
  posterPath: string | null;
  year?: string | null;
  /**
   * Voto 0-10 mostrato sotto il titolo: lo **ZappScore**, il voto di Zapp che somma
   * tutte le fonti (`src/lib/ratings/`). Dove non c'è ancora si passa il voto TMDB;
   * `null` = titolo senza voto. Uno zero vale come assente: TMDB scrive `0` sui
   * titoli che nessuno ha votato, e "★ 0" si legge come una stroncatura.
   */
  rating?: number | null;
  /**
   * Quanti voti stanno dietro quel numero: è il "· 2,4M voti" accanto al punteggio
   * (scelta utente 2026-09-08: sotto la copertina si vede il voto **e** quanta gente
   * l'ha dato, altrimenti un 9,2 con dodici voti sembra un capolavoro). Si mostra
   * solo insieme allo ZappScore: il voto TMDB da solo non porta il conteggio.
   */
  votes?: number | null;
  /**
   * Il voto di chi possiede la lista (il proprio in libreria, quello dell'amico sul
   * suo profilo): **una cifra grande in fondo alla copertina**, come nello scaffale
   * "I voti più alti" del profilo (scelta utente 2026-09-08). Convive con lo
   * ZappScore, che resta nella riga sotto il titolo: sono due numeri diversi.
   */
  userRating?: number | null;
  /**
   * Di chi è quel voto: non si scrive in pagina (la cifra sta sulla copertina, dove
   * una parola non ci sta) ma finisce nel `title` — "tuo 9", "Marco 9".
   */
  userRatingLabel?: string;
  /**
   * Perché questo titolo è consigliato ("Stessa saga", "Di Denis Villeneuve",
   * "Rapina · Vendetta"): una riga sotto il titolo. È ciò che rende visibile che il
   * consiglio non è casuale — senza, uno scaffale di consigli e uno di popolari si
   * somigliano troppo.
   */
  reason?: string | null;
  /**
   * Affinità personale 0-100 ("per te 92%"): la accende la fase C dell'algoritmo.
   * Finché è `null` non si vede niente, così i componenti non andranno più toccati.
   */
  affinity?: number | null;
  /** Mostra "Senza voto" quando `rating` è esplicitamente `null`. */
  showNoRating?: boolean;
  providers?: PosterCardProvider[];
  href?: string;
  /**
   * Dichiara la copertina al `PreviewLayer` (home): fermandoci sopra il mouse, su
   * desktop, si apre la scheda di anteprima col trailer. La card resta un componente
   * server: qui esce solo un attributo.
   */
  preview?: boolean;
  /**
   * Dichiara la copertina alla raccolta dei segnali (fase A): impression quando entra
   * nello schermo, apertura quando la si tocca. La card resta un componente server:
   * qui esce solo un attributo, come per `preview`. Tipo e id si leggono dall'`href`.
   */
  signal?: { surface: Surface; position?: number | null } | null;
  className?: string;
  /**
   * Pillola in alto a sinistra: la posizione in classifica ("#3 su Netflix") oppure
   * "in salita". La posizione ha la precedenza. Oggi le classifiche che scriviamo sono
   * tutte da 10 posizioni, quindi il ramo "in salita" non si vede mai sulle locandine —
   * resta per il giorno in cui una fonte ne desse di più lunghe. Lo scaffale
   * "In salita questa settimana" funziona comunque, perché non passa di qui.
   */
  chartBadge?: { rank: number; providerName: string; rising: boolean } | null;
  /**
   * Larghezza reale della copertina nel layout: il loader TMDB ne ricava la taglia
   * più piccola che la copre. Chi mette le card in una griglia larga deve passarlo,
   * altrimenti si prende un `w342` scalato in su, cioè sgranato.
   */
  sizes?: string;
}) {
  const src = posterUrl(posterPath, "w342");
  const bersaglio = signal ? targetFromHref(href) : null;
  const signalTarget = bersaglio
    ? signalAttr(
        bersaglio.mediaType,
        bersaglio.titleId,
        signal!.surface,
        signal!.position,
      )
    : null;

  const card = (
    <div
      className={`group cv-auto ${className}`}
      data-preview={preview && href ? href : undefined}
      data-signal={signalTarget ?? undefined}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[14px] bg-surface-2">
        {src ? (
          <Image src={src} alt={title} fill sizes={sizes} className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted">
            {title}
          </div>
        )}
        {chartBadge && (chartBadge.rank <= 10 || chartBadge.rising) && (
          <span className="glass absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold">
            {chartBadge.rank <= 10
              ? `#${chartBadge.rank} su ${chartBadge.providerName}`
              : "↑ in salita"}
          </span>
        )}
        {userRating != null && (
          <>
            {/* stessa forma dei voti del profilo (`TopRatedShelf`): velo dal basso e
                la cifra nell'angolo, sulla copertina — non una riga di testo sotto */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-[64px] bg-gradient-to-t from-black/85 to-transparent"
            />
            <span
              title={`${userRatingLabel} ${formatScore(userRating)}`}
              className="absolute bottom-1.5 right-2.5 text-[26px] font-extrabold leading-none tracking-[-0.05em] text-accent-pale"
            >
              {formatScore(userRating)}
            </span>
          </>
        )}
        {providers.length > 0 && (
          <div className="absolute bottom-1.5 left-1.5 flex gap-1">
            {providers.slice(0, 3).map((p) => {
              const logo = providerLogoUrl(p.logoPath);
              return logo ? (
                <Image
                  key={p.id}
                  src={logo}
                  alt={p.name}
                  title={p.name}
                  width={20}
                  height={20}
                  className="size-5 rounded-md border border-black/50"
                />
              ) : null;
            })}
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-tight">
        {title}
        {year && <span className="text-muted"> · {year}</span>}
      </p>
      {reason && <p className="mt-0.5 line-clamp-1 text-[11px] text-muted">{reason}</p>}
      {rating != null && rating > 0 ? (
        <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-accent-soft">
          ★ {formatScore(rating)}
          {votes != null && votes > 0 && (
            <span className="text-muted"> · {formatVotes(votes)} voti</span>
          )}
          {affinity != null && (
            <span className="text-muted"> · per te {Math.round(affinity)}%</span>
          )}
        </span>
      ) : (rating == null || rating <= 0) && showNoRating ? (
        <span className="text-[11px] font-semibold text-muted">Senza voto</span>
      ) : null}
    </div>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }
  return card;
}
