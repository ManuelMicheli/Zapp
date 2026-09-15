import type { ReactNode } from "react";
import { PosterWall } from "@/components/marketing/PosterWall";

/**
 * Sfumatura verso il nero sotto il muro di locandine: resta leggera a lungo
 * (il muro si vede fin quasi al fondo della testata) e chiude sul nero solo
 * negli ultimi 12%, dove comincia il contenuto.
 */
const HEADER_SCRIM =
  "linear-gradient(180deg,rgba(0,0,0,0.5) 0%,rgba(0,0,0,0.18) 26%,rgba(0,0,0,0.32) 55%,rgba(0,0,0,0.62) 74%,rgba(0,0,0,0.9) 88%,#000 100%)";

/**
 * Stessa sfumatura quando la parete continua oltre la testata (`below`, solo sul
 * telefono; da `md` in su vale sempre `HEADER_SCRIM`): le prime
 * tappe sono ancorate in px all'altezza della testata (`--ph`), non in percentuale,
 * cosi' la testata resta identica a prima; poi il velo si tiene su 0,86 — le
 * locandine si intravedono dietro il percorso cinefilo — e chiude sul nero negli
 * ultimi 300px, dove comincia "Le tue statistiche".
 */
const EXTENDED_SCRIM = [
  "linear-gradient(180deg,rgba(0,0,0,0.5) 0px",
  "rgba(0,0,0,0.18) calc(var(--ph) * 0.26)",
  "rgba(0,0,0,0.32) calc(var(--ph) * 0.55)",
  "rgba(0,0,0,0.62) calc(var(--ph) * 0.74)",
  "rgba(0,0,0,0.88) var(--ph)",
  "rgba(0,0,0,0.86) calc(var(--ph) + 140px)",
  "rgba(0,0,0,0.86) calc(100% - 300px)",
  "#000 100%)",
].join(",");

/**
 * Altezza della parete lunga **sul telefono**. Le colonne non possono allungarsi
 * quanto si vuole: oltre il piano camera il compositor fa sparire le tessere
 * (vedi `wallGeometry`). Questo e' il valore piu' alto che resta al di qua del
 * piano (13 tessere per colonna) e non costa rete: le locandine per colonna sono
 * sempre quattro, quindi le tessere in piu' riusano le stesse URL.
 *
 * Da `md` in su la parete **non** si allunga: resta dietro la testata come prima.
 */
const TALL_WALL_MOBILE = 2400;

/** Sfuma il fondo della parete: dove finisce non si deve vedere un bordo netto. */
const WALL_FADE =
  "[mask-image:linear-gradient(180deg,#000_0,#000_82%,transparent_100%)] [-webkit-mask-image:linear-gradient(180deg,#000_0,#000_82%,transparent_100%)]";

/**
 * Le locandine arrivano tutte insieme (`instant`): il muro del profilo e' alto e quasi
 * tutte le tessere nascono fuori viewport, col caricamento a comparsa comparivano una
 * alla volta. Il muro nascosto dei due (`md:hidden` / `hidden md:block`) non scarica
 * niente lo stesso, perche' `instant` disegna le tessere con uno sfondo e non con `<img>`.
 *
 * Testata del profilo (proprio e altrui): muro di locandine personale, velo
 * verso il nero e, sopra, l'identità passata come `children`.
 *
 * `below` prosegue la stessa parete — stesse locandine, stesso scorrimento —
 * dietro il contenuto che segue la testata (sul proprio profilo: il percorso
 * cinefilo, fino a "Le tue statistiche"), ma **solo sul telefono**: da `md` in su
 * la parete resta dietro l'immagine profilo, come prima del percorso cinefilo.
 * Il riquadro della parete è ritagliato sull'intera regione, quindi se il
 * contenuto è più corto della parete il taglio cade dove il velo è già nero.
 */
export function ProfileWallHeader({
  posters,
  className = "",
  children,
  below,
}: {
  posters: string[];
  className?: string;
  children: ReactNode;
  below?: ReactNode;
}) {
  const extended = below !== undefined;
  return (
    <div className={`relative shrink-0 [--ph:480px] lg:[--ph:620px] ${className}`}>
      {/* Sul telefono la parete e il suo velo coprono tutta la regione (testata +
          `below`); da `md` in su il riquadro si ferma all'altezza della testata
          (`--ph`), cosi' le locandine restano dietro l'immagine profilo e non
          proseguono lungo la pagina */}
      <div
        data-profile-wall
        className="pointer-events-none absolute inset-0 overflow-hidden md:bottom-auto md:h-[var(--ph)]"
      >
        <PosterWall
          posters={posters}
          height={extended ? TALL_WALL_MOBILE : 560}
          opacity={0.75}
          speed="slow"
          instant
          className={`md:hidden ${extended ? WALL_FADE : ""}`}
        />
        {/* Desktop: il muro copre tutta la larghezza del contenuto e scende
            fin sotto l'immagine profilo (il velo lo lascia leggere a lungo) */}
        <PosterWall
          posters={posters}
          columns={20}
          width="calc(100% + 140px)"
          height={740}
          opacity={0.75}
          speed="slow"
          instant
          className="hidden md:block"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 md:hidden"
          style={{ background: extended ? EXTENDED_SCRIM : HEADER_SCRIM }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 hidden md:block"
          style={{ background: HEADER_SCRIM }}
        />
      </div>
      <header className="relative h-[480px] overflow-hidden lg:h-[620px]">
        {children}
      </header>
      {extended && <div className="relative">{below}</div>}
    </div>
  );
}
