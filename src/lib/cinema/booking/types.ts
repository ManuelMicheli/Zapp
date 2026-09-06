// Tipi del modulo biglietteria: link "profondi" verso il sito della catena per un
// film in un cinema, per singolo orario quando la catena espone lo spettacolo.

export interface BookingQuery {
  cinema: { id: number; name: string; lat: number; lng: number };
  film: { title: string; originalTitle: string | null };
  /** Giorno degli spettacoli, "YYYY-MM-DD" (ora di Roma). */
  date: string;
  /** Orari richiesti, "HH:MM". */
  times: string[];
}

export interface BookingLink {
  url: string;
  /** 2 = spettacolo esatto (scelta posti / carrello); 1 = pagina film o cinema. */
  level: 2 | 1;
}

export interface ChainLinks {
  /** Link per orario "HH:MM" (livello 2). */
  byTime: Map<string, BookingLink>;
  /** Pagina film/cinema della catena (livello 1), per gli orari senza link diretto. */
  fallback: BookingLink | null;
}
