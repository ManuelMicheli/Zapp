import Image from "next/image";
import Link from "next/link";
import {
  copertinaUrl,
  durataLabel,
  linguaLabel,
  type ShortCardData,
} from "@/lib/shorts/shape";

/**
 * La card di un corto: copertina 16:9 di YouTube, durata sopra, titolo e riga di
 * contesto sotto. La stessa card sta nella griglia di `/corti` e nello scaffale in
 * home, con `shelf` che cambia solo la larghezza (nello scaffale e' fissa a scalini,
 * nella griglia la detta la colonna) — come fa `SagaCard` per le saghe.
 *
 * `content-visibility` sulla card e non sul contenitore: la griglia ne disegna
 * centinaia, e senza il browser paga layout e paint anche per quelle fuori schermo.
 * La misura intrinseca dichiarata e' quella reale della card (16:9 + due righe di
 * testo), altrimenti la barra di scorrimento salta mentre si scende.
 */
export function ShortCard({
  corto,
  shelf = false,
  visto = false,
  preferito = false,
}: {
  corto: ShortCardData;
  shelf?: boolean;
  visto?: boolean;
  preferito?: boolean;
}) {
  return (
    <Link
      href={`/corti/${corto.slug}`}
      className={`group block focus-visible:outline-none ${
        shelf ? "w-[260px] shrink-0 md:w-[300px] lg:w-[340px]" : "w-full"
      }`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 320px" }}
    >
      <div className="relative isolate aspect-video overflow-hidden rounded-[18px] border border-border bg-surface group-focus-visible:outline-2 group-focus-visible:outline-offset-4 group-focus-visible:outline-accent">
        <Image
          src={copertinaUrl(corto)}
          alt=""
          fill
          unoptimized
          loading="lazy"
          className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.06]"
        />
        {/* velo dal basso: regge il contrasto della pillola e del triangolo */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/5 opacity-90 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Il tondo del play compare all'hover e resta sempre visibile al tocco:
            su telefono non esiste hover, e una copertina senza segno di "si apre"
            sembra un'immagine qualunque. */}
        <span className="glass absolute left-1/2 top-1/2 flex size-[52px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full opacity-0 transition-all duration-300 group-hover:opacity-100 motion-safe:group-hover:scale-105 max-lg:opacity-100">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 5.5v13l11-6.5-11-6.5Z" />
          </svg>
        </span>

        <span className="glass absolute bottom-2.5 right-2.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums">
          {durataLabel(corto.durata)}
        </span>

        {corto.riconoscimento && (
          <span className="glass-accent absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
            Premiato
          </span>
        )}

        {visto && (
          <span
            className="glass absolute right-2.5 top-2.5 flex size-7 items-center justify-center rounded-full text-accent-pale"
            title="Già visto"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m5 13 4 4L19 7" />
            </svg>
            <span className="sr-only">Già visto</span>
          </span>
        )}
        {preferito && !visto && (
          <span
            className="glass absolute right-2.5 top-2.5 flex size-7 items-center justify-center rounded-full text-accent-pale"
            title="Nei preferiti"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 21s-7.5-4.6-9.4-9A5.3 5.3 0 0 1 12 6.6 5.3 5.3 0 0 1 21.4 12c-1.9 4.4-9.4 9-9.4 9Z" />
            </svg>
            <span className="sr-only">Nei preferiti</span>
          </span>
        )}
      </div>

      <p className="mt-2.5 line-clamp-2 text-[13px] font-semibold leading-snug tracking-[-0.01em] lg:text-[15px]">
        {corto.titolo}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-muted lg:text-[12px]">
        {corto.genere} · {linguaLabel(corto)} · {corto.anno}
      </p>
    </Link>
  );
}
