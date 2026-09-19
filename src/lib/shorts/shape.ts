/**
 * Le **forme** dei cortometraggi: tipi ed etichette, senza il catalogo.
 *
 * Sta separato da `catalog.ts` per un motivo solo, e conta: `catalog.ts` importa
 * `src/data/short-films.json`, che e' grosso. Il player e i due bottoni della scheda
 * sono componenti client e hanno bisogno di `copertinaUrl` e `durataLabel`: se le
 * prendessero da `catalog.ts` il bundle del browser si porterebbe dietro **tutto il
 * catalogo** — quattrocento trame — per disegnare una pagina sola.
 */

export type ShortLang = "it" | "en";

export interface ShortFilm {
  /** Chiave nell'indirizzo: `/corti/hair-love`. */
  slug: string;
  /** Chiave stabile: e' quella che finisce in `short_film_entries.short_id`. */
  youtubeId: string;
  titolo: string;
  trama: string;
  genere: string;
  lingua: ShortLang;
  /** Vero quando il corto si guarda senza capire una parola: nessun dialogo. */
  senzaDialoghi?: boolean;
  /** Premio o candidatura, quando c'e': una riga sola, gia' in italiano. */
  riconoscimento?: string;
  /** Secondi. */
  durata: number;
  anno: number;
  canale: string;
  canaleId: string;
  /** Al giorno della generazione del file, non in tempo reale. */
  visualizzazioni: number;
  /** Vero se YouTube ha la copertina `maxresdefault` (1280px). */
  copertinaHd: boolean;
}

/**
 * Quel che serve a disegnare una card, e nient'altro.
 *
 * La griglia di `/corti` filtra nel client, quindi l'elenco attraversa il confine
 * server/client e finisce nel payload della pagina: passare i corti interi
 * significherebbe spedire al browser **tutte le trame** — il campo piu' pesante del
 * file — per mostrarne una sola, quella della card di copertina.
 */
export type ShortCardData = Omit<
  ShortFilm,
  "trama" | "canale" | "canaleId" | "visualizzazioni"
>;

export function cardDi(corto: ShortFilm): ShortCardData {
  // Elenco esplicito invece di un rest che scarta: aggiungendo un campo a `ShortFilm`
  // il rest se lo porterebbe dietro nel client in silenzio, qui invece bisogna
  // decidere di metterlo.
  return {
    slug: corto.slug,
    youtubeId: corto.youtubeId,
    titolo: corto.titolo,
    genere: corto.genere,
    lingua: corto.lingua,
    ...(corto.senzaDialoghi ? { senzaDialoghi: true } : {}),
    ...(corto.riconoscimento ? { riconoscimento: corto.riconoscimento } : {}),
    durata: corto.durata,
    anno: corto.anno,
    copertinaHd: corto.copertinaHd,
  };
}

export interface ShortFiltri {
  /** `it`, `en`, `muto` (senza dialoghi) oppure niente = tutti. */
  lingua?: string;
  /** Un genere del catalogo, oppure niente = tutti. */
  genere?: string;
}

/**
 * Le copertine vengono da `i.ytimg.com` e non dal nostro dominio: sono le miniature
 * che YouTube genera per ogni video. `maxresdefault` esiste solo se il caricamento
 * era almeno 1280px — per i corti piu' vecchi non c'e', e il file dice quali
 * (`copertinaHd`), cosi' non si scopre l'assenza con un 404 davanti all'utente.
 *
 * Nota: l'host va tenuto in `img-src` **e** in `connect-src` nella CSP di
 * `next.config.ts`; la seconda perche' la CSP vale anche per il service worker.
 */
export function copertinaUrl(corto: ShortCardData): string {
  const file = corto.copertinaHd ? "maxresdefault" : "hqdefault";
  return `https://i.ytimg.com/vi/${corto.youtubeId}/${file}.jpg`;
}

/** L'indirizzo del video su YouTube, per il link "Guarda su YouTube". */
export function youtubeUrl(corto: ShortCardData): string {
  return `https://www.youtube.com/watch?v=${corto.youtubeId}`;
}

/** `7 min`, `21 min`. Sotto il minuto non ce n'e': il taglio del catalogo e' 2 min. */
export function durataLabel(secondi: number): string {
  return `${Math.max(1, Math.round(secondi / 60))} min`;
}

/** `5,4 mln`, `212 mila`: il numero intero sarebbe illeggibile su una card. */
export function visualizzazioniLabel(n: number): string {
  if (n >= 1_000_000) {
    const mln = n / 1_000_000;
    return `${mln >= 10 ? Math.round(mln) : mln.toFixed(1).replace(".", ",")} mln`;
  }
  if (n >= 1000) return `${Math.round(n / 1000)} mila`;
  return String(n);
}

export function linguaLabel(corto: ShortCardData): string {
  if (corto.senzaDialoghi) return "Senza dialoghi";
  return corto.lingua === "it" ? "Italiano" : "Inglese";
}

/**
 * I corti che passano i filtri, nell'ordine in cui arrivano (fama decrescente).
 *
 * Prende la lista invece di leggere `SHORT_FILMS`: la chiama anche il client, che
 * ha in mano solo le card snelle (`ShortCardData`), non i corti interi.
 */
export function filtraShorts<T extends ShortCardData>(
  corti: T[],
  filtri: ShortFiltri,
): T[] {
  return corti.filter((c) => {
    if (filtri.genere && c.genere !== filtri.genere) return false;
    if (!filtri.lingua) return true;
    if (filtri.lingua === "muto") return Boolean(c.senzaDialoghi);
    // Un corto senza dialoghi non appartiene a nessuna delle due lingue: metterlo
    // sotto "Inglese" perche' il cartello finale e' in inglese ingannerebbe.
    return !c.senzaDialoghi && c.lingua === filtri.lingua;
  });
}
