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
