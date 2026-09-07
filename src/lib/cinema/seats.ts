// Posti e sala letti dal testo del biglietto (PDF): funzioni pure, test Vitest.
// I biglietti italiani scrivono la stessa cosa in molti modi ("Fila G Posto 12",
// "FILA: G - POSTO: 12", "Posto G12", "Posti G12, G13"), quindi si prova in ordine
// dal formato più esplicito al più corto e si tiene il primo che dà risultati.

/** Al massimo 10 posti (come i QR) e nomi corti: sono etichette, non frasi. */
const MAX_SEATS = 10;
const MAX_SEAT_LENGTH = 24;

export interface TicketSeats {
  /** Etichette pronte da mostrare, es. "Fila G · Posto 12". */
  seats: string[];
  /** "Sala 5" / "Sala Rossa", null se il biglietto non la dice. */
  hall: string | null;
}

const EMPTY: TicketSeats = { seats: [], hall: null };

/** Spazi normalizzati: il testo dei PDF arriva a pezzi, con a capo in mezzo. */
function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function push(into: string[], label: string): void {
  const v = label.trim().slice(0, MAX_SEAT_LENGTH);
  if (v && !into.includes(v) && into.length < MAX_SEATS) into.push(v);
}

/** "Sala 5", "SALA: Rossa", "sala 3 - IMAX" → "Sala 5" / "Sala Rossa". */
export function parseHall(text: string): string | null {
  const m = /\bsala\b\s*[:.\-–]?\s*([A-Za-zÀ-ÿ0-9]{1,12})/i.exec(flatten(text));
  if (!m) return null;
  const value = m[1];
  // "Sala di proiezione", "sala in": parole comuni, non il nome della sala
  if (/^(di|in|del|della|proiezione|cinema)$/i.test(value)) return null;
  return `Sala ${value.toUpperCase() === value && value.length > 1 ? value : capitalize(value)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * I posti scritti come coppia fila/posto: "Fila G Posto 12", "FILA: G - POSTO: 12",
 * anche ripetuta per più biglietti nello stesso PDF.
 */
function parsePairs(flat: string): string[] {
  const re =
    /\bfila\b\s*[:.\-–]?\s*([A-Za-z0-9]{1,3})\b[\s,;\-–]*\b(?:posto|poltrona)\b\s*[:.\-–]?\s*([A-Za-z]?\d{1,3})\b/gi;
  const out: string[] = [];
  for (const m of flat.matchAll(re)) {
    push(out, `Fila ${m[1].toUpperCase()} · Posto ${m[2].toUpperCase()}`);
  }
  return out;
}

/** "Posto G12", "Posti: G12, G13", "Poltrona F7". */
function parseSingles(flat: string): string[] {
  const re =
    /\b(?:posti|posto|poltrone|poltrona)\b\s*[:.\-–]?\s*([A-Za-z]?\d{1,3}(?:\s*[,;/e]\s*[A-Za-z]?\d{1,3})*)/gi;
  const out: string[] = [];
  for (const m of flat.matchAll(re)) {
    for (const piece of m[1].split(/\s*[,;/]\s*|\s+e\s+/i)) {
      push(out, `Posto ${piece.trim().toUpperCase()}`);
    }
  }
  return out;
}

/**
 * Posti e sala dal testo del biglietto. Nessuna corrispondenza → `EMPTY`: la
 * schermata finale di "Sono qui" chiede allora di scriverli a mano.
 */
export function parseSeats(text: string | null | undefined): TicketSeats {
  if (!text) return EMPTY;
  const flat = flatten(text);
  const pairs = parsePairs(flat);
  const seats = pairs.length > 0 ? pairs : parseSingles(flat);
  return { seats, hall: parseHall(flat) };
}

/** Ripulisce i posti scritti a mano dall'utente ("G12, G13" → due etichette). */
export function cleanSeatInput(value: string): string[] {
  const out: string[] = [];
  for (const piece of value.split(/[,;\n]/)) push(out, flatten(piece));
  return out;
}
