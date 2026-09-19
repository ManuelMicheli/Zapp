"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { HorizontalScroll } from "@/components/ui/HorizontalScroll";
import { filtraShorts, type ShortCardData, type ShortFilm } from "@/lib/shorts/shape";
import { ShortCard } from "./ShortCard";
import { ShortFeatured } from "./ShortFeatured";

/**
 * La griglia di `/corti` con i suoi filtri.
 *
 * I filtri stanno nello **stato del client**, non nella query dell'indirizzo: sullo
 * stesso pathname con la sola query diversa l'App Router non naviga (la trappola
 * descritta in `docs/architecture/genres.md`), e comunque le card sono gia' tutte in
 * pagina — filtrarle in memoria e' istantaneo, mentre un giro dal server per scoprire
 * quali restano sarebbe tempo regalato. Le card che arrivano qui sono **snelle**
 * (`ShortCardData`, senza trama): la lista attraversa il confine server/client, e le
 * trame di tutto il catalogo peserebbero piu' di tutto il resto della pagina.
 *
 * Prezzo accettato: un filtro non e' condivisibile con un link e non sopravvive al
 * tasto "indietro". Il link che conta e' quello del singolo corto, e quello c'e'.
 */

const LINGUE = [
  { chiave: "", label: "Tutte le lingue" },
  { chiave: "it", label: "Italiano" },
  { chiave: "en", label: "Inglese" },
  { chiave: "muto", label: "Senza dialoghi" },
] as const;

const PILL =
  "inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[13px] font-semibold transition-colors lg:h-10 lg:text-[14px]";
const PILL_ON = "glass-accent text-white";
const PILL_OFF = "glass text-muted hover:text-text";

export function ShortsBrowser({
  corti,
  copertina,
  generi,
  visti,
  preferiti,
}: {
  /** Tutte le card del catalogo, gia' snelle: vedi `ShortCardData`. */
  corti: ShortCardData[];
  /** Il primo corto, intero, per la card di apertura (ha bisogno della trama). */
  copertina: ShortFilm;
  generi: string[];
  /** Id YouTube dei corti gia' visti da chi guarda. */
  visti: string[];
  preferiti: string[];
}) {
  const [lingua, setLingua] = useState("");
  const [genere, setGenere] = useState("");
  // "" = tutti, "da-vedere" = quelli che non hai ancora visto, "preferiti" = i tuoi.
  // Un solo stato e non due interruttori: "da vedere" e "preferiti" insieme daranno
  // quasi sempre zero risultati, e una combinazione che non porta da nessuna parte
  // non merita di essere possibile.
  const [mio, setMio] = useState("");

  const setVisti = useMemo(() => new Set(visti), [visti]);
  const setPreferiti = useMemo(() => new Set(preferiti), [preferiti]);

  const filtrati = useMemo(() => {
    const base = filtraShorts(corti, {
      lingua: lingua || undefined,
      genere: genere || undefined,
    });
    if (mio === "da-vedere") return base.filter((c) => !setVisti.has(c.youtubeId));
    if (mio === "preferiti") return base.filter((c) => setPreferiti.has(c.youtubeId));
    return base;
  }, [corti, lingua, genere, mio, setVisti, setPreferiti]);

  // Il primo corto fa da copertina solo quando la lista e' quella intera: con un
  // filtro addosso il "piu' famoso di quelli rimasti" non e' una notizia.
  const senzaFiltri = !lingua && !genere && !mio;
  const inApertura = senzaFiltri ? copertina : null;
  const griglia = inApertura ? filtrati.slice(1) : filtrati;

  return (
    <>
      {/* La barra dei filtri resta in alto mentre si scorre: le card sono centinaia, e
          tornare su ogni volta per cambiare genere sarebbe una salita. Il fondo è
          **nero pieno**, non una sfumatura e nemmeno un nero all'92%: con la sfumatura
          si vedeva la prima fila di card passare dietro le pillole, e con il nero
          quasi-pieno restava un fantasma (l'8% di una copertina accesa, su fondo nero,
          si vede benissimo). La sfumatura resta solo per gli otto pixel sotto la barra,
          dove taglia il bordo netto. */}
      <div className="sticky top-0 z-10 -mx-5 mb-6 px-5 pb-1 pt-2 lg:-mx-10 lg:top-[var(--nav-top)] lg:px-10">
        <div className="absolute inset-x-0 bottom-2 top-0 bg-bg" />
        <div className="absolute inset-x-0 bottom-0 h-3 bg-gradient-to-b from-bg to-transparent" />
        <div className="relative">
          <HorizontalScroll
            label="Filtra per lingua"
            className="scrollbar-none flex gap-2 overflow-x-auto pb-1"
          >
            {LINGUE.map((l) => (
              <button
                key={l.chiave}
                type="button"
                onClick={() => setLingua(l.chiave)}
                aria-pressed={lingua === l.chiave}
                className={`${PILL} ${lingua === l.chiave ? PILL_ON : PILL_OFF}`}
              >
                {l.label}
              </button>
            ))}
            {/* I due filtri che parlano di te compaiono solo quando hanno qualcosa da
              filtrare: a un ospite, o a chi non ha ancora segnato niente, direbbero
              "nessun corto con questi filtri" e basta. */}
            {visti.length > 0 && (
              <button
                type="button"
                onClick={() => setMio((v) => (v === "da-vedere" ? "" : "da-vedere"))}
                aria-pressed={mio === "da-vedere"}
                className={`${PILL} ${mio === "da-vedere" ? PILL_ON : PILL_OFF}`}
              >
                Da vedere
              </button>
            )}
            {preferiti.length > 0 && (
              <button
                type="button"
                onClick={() => setMio((v) => (v === "preferiti" ? "" : "preferiti"))}
                aria-pressed={mio === "preferiti"}
                className={`${PILL} ${mio === "preferiti" ? PILL_ON : PILL_OFF}`}
              >
                I tuoi preferiti
              </button>
            )}
          </HorizontalScroll>

          <HorizontalScroll
            label="Filtra per genere"
            className="scrollbar-none mt-2 flex gap-2 overflow-x-auto pb-1"
          >
            <button
              type="button"
              onClick={() => setGenere("")}
              aria-pressed={genere === ""}
              className={`${PILL} ${genere === "" ? PILL_ON : PILL_OFF}`}
            >
              Tutti i generi
            </button>
            {generi.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGenere(g)}
                aria-pressed={genere === g}
                className={`${PILL} ${genere === g ? PILL_ON : PILL_OFF}`}
              >
                {g}
              </button>
            ))}
          </HorizontalScroll>
        </div>
      </div>

      {filtrati.length === 0 ? (
        <EmptyState
          title="Nessun corto con questi filtri"
          description="Prova a togliere il genere o a cambiare lingua."
        />
      ) : (
        <>
          {inApertura && (
            <ShortFeatured
              corto={inApertura}
              visto={setVisti.has(inApertura.youtubeId)}
              className="mb-7"
            />
          )}

          <p className="mb-4 text-[13px] text-muted">
            {filtrati.length === 1
              ? "1 cortometraggio"
              : `${filtrati.length} cortometraggi`}
            {mio === "da-vedere" && " ancora da vedere"}
            {mio === "preferiti" && " tra i tuoi preferiti"}
          </p>

          <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-4 lg:gap-x-5 lg:gap-y-8 xl:grid-cols-4">
            {griglia.map((corto) => (
              <ShortCard
                key={corto.slug}
                corto={corto}
                visto={setVisti.has(corto.youtubeId)}
                preferito={setPreferiti.has(corto.youtubeId)}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
