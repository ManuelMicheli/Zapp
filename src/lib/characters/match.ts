import type { TmdbCastMember } from "@/lib/tmdb/types";

/**
 * Abbina i ritratti di una fonte esterna (TVmaze, AniList) al cast di TMDB.
 * Puro: si prova con Vitest. Nessuna fonte ha l'id TMDB della persona, quindi
 * si abbina per nome dell'interprete e, in seconda battuta, per nome del
 * personaggio; i nomi si confrontano in forma "larga": senza accenti,
 * punteggiatura e parentesi, con le vocali lunghe giapponesi accorciate
 * ("Shidou" = "Shidō" = "Shido") e senza badare all'ordine delle parole
 * ("Miyano Mamoru" = "Mamoru Miyano").
 */

/** Una voce di una fonte di ritratti, già ridotta a ciò che serve. */
export interface PortraitSourceEntry {
  /** Interprete o doppiatore; vuoto se la fonte non lo dice. */
  personName: string;
  /**
   * Altre grafie dello stesso nome (AniList: il nome nativo in kana/kanji). Con
   * `language=it-IT` TMDB scrive alcuni doppiatori in giapponese (佐々木望 per
   * Nozomu Sasaki): senza l'alias nativo non si abbinerebbero mai.
   */
  personNames?: string[];
  characterName: string;
  /** URL del ritratto del personaggio, nullo se la fonte non ce l'ha. */
  image: string | null;
}

export interface CharacterPortrait {
  personId: number;
  image: string;
}

/**
 * Minuscolo, senza accenti, senza parentesi né punteggiatura, spazi singoli.
 * Le lettere di ogni alfabeto restano (kanji e kana compresi): TMDB in italiano
 * scrive alcuni doppiatori giapponesi nella grafia nativa.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** Parole di un nome in forma larga, ordinate: chiave indipendente dall'ordine. */
function looseTokens(name: string): string[] {
  return normalizeName(name)
    .split(" ")
    .filter(Boolean)
    .map((t) =>
      t.replace(/ou/g, "o").replace(/uu/g, "u").replace(/oo/g, "o").replace(/aa/g, "a"),
    )
    .sort();
}

/**
 * Chiave di confronto: parole larghe ordinate; per un nome in kanji/kana solo i
 * caratteri, senza spazi (AniList scrive "佐々木 望", TMDB "佐々木望").
 */
function looseKey(name: string): string {
  const n = normalizeName(name);
  if (CJK.test(n)) return n.replace(/\s+/g, "");
  return looseTokens(n).join(" ");
}

/** Tutte le forme di un nome di personaggio: "Eleven / Jane Hopper" → entrambe. */
function characterForms(character: string | null | undefined): string[] {
  return (character ?? "")
    .split("/")
    .map((s) => looseKey(s))
    .filter((s) => s.length > 0);
}

/** Parole "di peso" di un personaggio: niente titoli e articoli. */
const STOP = new Set([
  "dr",
  "mr",
  "mrs",
  "ms",
  "the",
  "il",
  "la",
  "lo",
  "of",
  "jr",
  "sr",
]);
function weighty(form: string): string[] {
  return form.split(" ").filter((t) => t.length >= 2 && !STOP.has(t));
}

/**
 * Due forme di personaggio parlano della stessa persona? Uguali, oppure una è
 * contenuta nell'altra parola per parola ("l" ⊂ "l lawliet", "walter white" ⊂
 * "walter hartwell white"), purché la più corta abbia almeno una parola di peso.
 */
function sameCharacter(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const s = weighty(short);
  if (s.length === 0) return short === long;
  const l = new Set(long.split(" "));
  return s.every((t) => l.has(t));
}

/**
 * Per ogni membro del cast TMDB senza ritratto, il ritratto della fonte se si
 * trova. Ogni voce della fonte si usa una volta sola (due attori omonimi non
 * prendono lo stesso ritratto). `already` sono i ritratti già trovati da una
 * fonte precedente: non si toccano, la fonte nuova riempie solo i buchi.
 */
export function matchPortraits(
  cast: TmdbCastMember[],
  source: PortraitSourceEntry[],
  already: Map<number, CharacterPortrait> = new Map(),
): Map<number, CharacterPortrait> {
  const out = new Map(already);
  const entries = source.filter((e) => e.image);
  const byPerson = new Map<string, PortraitSourceEntry[]>();
  for (const entry of entries) {
    const names = [entry.personName, ...(entry.personNames ?? [])].filter(Boolean);
    for (const key of new Set(names.map(looseKey))) {
      if (!key) continue;
      byPerson.set(key, [...(byPerson.get(key) ?? []), entry]);
    }
  }
  const used = new Set<PortraitSourceEntry>();
  const firstFree = (candidates: PortraitSourceEntry[] | undefined) =>
    candidates?.find((c) => !used.has(c)) ?? null;

  // primo giro: per interprete (il segnale più affidabile)
  const pending: TmdbCastMember[] = [];
  for (const member of cast) {
    if (out.has(member.id)) continue;
    const found = firstFree(byPerson.get(looseKey(member.name)));
    if (found) {
      used.add(found);
      out.set(member.id, { personId: member.id, image: found.image! });
    } else {
      pending.push(member);
    }
  }

  // secondo giro: per personaggio, prima le uguaglianze esatte poi le inclusioni
  for (const exact of [true, false]) {
    for (const member of pending) {
      if (out.has(member.id)) continue;
      const forms = characterForms(member.character);
      const found = entries.find(
        (e) =>
          !used.has(e) &&
          characterForms(e.characterName).some((f) =>
            forms.some((m) => (exact ? m === f : sameCharacter(m, f))),
          ),
      );
      if (found) {
        used.add(found);
        out.set(member.id, { personId: member.id, image: found.image! });
      }
    }
  }
  return out;
}
