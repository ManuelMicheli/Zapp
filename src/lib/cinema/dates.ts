// Date e orari degli spettacoli, sempre nel fuso dei cinema italiani.
// Nessuna dipendenza: usa solo Intl (Node 20+ supporta `longOffset`).

const TZ = "Europe/Rome";

export interface DayOption {
  /** YYYY-MM-DD */
  date: string;
  /** "Oggi", "Domani", "Gio 7" */
  label: string;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Data locale di Roma in formato YYYY-MM-DD. */
export function romeDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Offset di Roma ("+02:00" / "+01:00") nel giorno indicato. */
function romeOffset(date: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    timeZoneName: "longOffset",
  }).formatToParts(new Date(`${date}T12:00:00Z`));
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const offset = name.replace("GMT", "");
  return offset === "" ? "+00:00" : offset;
}

/** Giorno successivo a `date` (YYYY-MM-DD), a mezzogiorno UTC per evitare l'ora legale. */
export function nextDay(date: string): string {
  return romeDateString(new Date(new Date(`${date}T12:00:00Z`).getTime() + 86_400_000));
}

/** `date` + `hhmm` locali di Roma → ISO 8601 con offset. */
export function romeIso(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00${romeOffset(date)}`;
}

/** I prossimi `n` giorni a partire da `from` (oggi a Roma). */
export function nextDays(n = 7, from: Date = new Date()): DayOption[] {
  const fmt = new Intl.DateTimeFormat("it-IT", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
  });
  const out: DayOption[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(from.getTime() + i * 86_400_000);
    const label = i === 0 ? "Oggi" : i === 1 ? "Domani" : capitalize(fmt.format(d));
    out.push({ date: romeDateString(d), label });
  }
  return out;
}

/**
 * Giorno di uno spettacolo rispetto a oggi: "oggi", "domani", altrimenti "mer 9".
 * `today` è la data di Roma (YYYY-MM-DD) di chi chiama.
 */
export function relativeDayLabel(iso: string, today: string): string {
  const date = romeDateString(new Date(iso));
  if (date === today) return "oggi";
  if (date === nextDay(today)) return "domani";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
  }).format(new Date(iso));
}

/** "Gio 10 set · 21:00" */
export function formatShowingDate(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("it-IT", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
  return `${capitalize(day)} · ${formatTime(iso)}`;
}

/** "21:05" */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Fasce orarie della programmazione: come si sceglie uno spettacolo a voce. */
export type ShowingBand = "pomeriggio" | "sera" | "tarda";

export const SHOWING_BANDS: { id: ShowingBand; label: string }[] = [
  { id: "pomeriggio", label: "Pomeriggio" },
  { id: "sera", label: "Sera" },
  { id: "tarda", label: "Tarda sera" },
];

/**
 * Fascia di uno spettacolo, sull'ora di Roma: fino alle 17:59 pomeriggio, fino alle
 * 20:59 sera, dalle 21:00 tarda sera. Le proiezioni di notte fonda (dopo mezzanotte)
 * restano in "tarda sera": appartengono alla serata precedente.
 */
export function showingBand(iso: string): ShowingBand {
  const hour = Number(formatTime(iso).slice(0, 2));
  if (hour >= 21 || hour < 6) return "tarda";
  if (hour >= 18) return "sera";
  return "pomeriggio";
}

export function minutesUntil(iso: string, now: number = Date.now()): number {
  return Math.round((new Date(iso).getTime() - now) / 60_000);
}

/** "tra 2 h 10" / "tra 35 min" / "adesso" / "iniziato" */
export function formatCountdown(minutes: number): string {
  if (minutes < 0) return "iniziato";
  if (minutes === 0) return "adesso";
  if (minutes < 60) return `tra ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `tra ${h} h` : `tra ${h} h ${m}`;
}

/**
 * Ore e minuti del conto alla rovescia per le cifre grandi del banner "Stasera":
 * null a spettacolo iniziato.
 */
export function countdownParts(
  minutes: number,
): { hours: number; minutes: number } | null {
  if (minutes < 0) return null;
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

/** Minuti dopo l'inizio oltre i quali il banner della serata sparisce dalla home. */
export const PLAN_BANNER_AFTER_START_MIN = 60;
/** Pubblicità e trailer prima della proiezione: lo spettacolo finisce più tardi. */
const ADS_MIN = 20;
/** Durata di ripiego quando il film non ha `runtime` su TMDB. */
const FALLBACK_RUNTIME_MIN = 120;
/** Oltre questi giorni dalla proiezione non si chiede più com'è andata. */
const ASK_WINDOW_DAYS = 7;

/**
 * In che fase è una serata "Ci vado":
 * - `upcoming`: da mostrare in home (fino a un'ora dopo l'inizio);
 * - `during`: film in corso, la home non mostra nulla;
 * - `ended`: film finito da poco, si chiede com'è andata al rientro nell'app;
 * - `gone`: troppo vecchia, si lascia perdere.
 */
export function planPhase(
  startsAt: string,
  runtimeMin: number | null,
  now: number = Date.now(),
): "upcoming" | "during" | "ended" | "gone" {
  const start = new Date(startsAt).getTime();
  if (Number.isNaN(start)) return "gone";
  const minutes = Math.round((now - start) / 60_000);
  if (minutes < PLAN_BANNER_AFTER_START_MIN) return "upcoming";
  const runtime = runtimeMin && runtimeMin > 0 ? runtimeMin : FALLBACK_RUNTIME_MIN;
  if (minutes < ADS_MIN + runtime) return "during";
  return minutes < ASK_WINDOW_DAYS * 24 * 60 ? "ended" : "gone";
}
