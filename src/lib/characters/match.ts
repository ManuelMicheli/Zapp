import type { TmdbCastMember } from "@/lib/tmdb/types";
import { primaryCharacter } from "./rank";

/**
 * Abbina i ritratti dei personaggi di TVmaze al cast di TMDB. Puro: si prova
 * con Vitest. TVmaze non ha l'id TMDB della persona, quindi si abbina per nome
 * dell'interprete e, in seconda battuta, per nome del personaggio.
 */

/** Una voce del cast di TVmaze, già ridotta a ciò che serve. */
export interface TvmazeCastEntry {
  personName: string;
  characterName: string;
  /** URL del ritratto del personaggio (taglia grande), nullo se TVmaze non ce l'ha. */
  image: string | null;
}

export interface CharacterPortrait {
  personId: number;
  image: string;
  /** Il nome del personaggio come lo scrive TVmaze (spesso più completo). */
  characterName: string;
}

/** Minuscolo, senza accenti, senza punteggiatura, spazi singoli. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tutte le forme di un nome di personaggio: "Eleven / Jane Hopper" → entrambe. */
function characterForms(character: string | null | undefined): string[] {
  return (character ?? "")
    .split("/")
    .map((s) => normalizeName(s))
    .filter((s) => s.length > 0);
}

/**
 * Per ogni membro del cast TMDB, il ritratto TVmaze se si trova. Ogni voce
 * TVmaze si usa una volta sola, così due attori con lo stesso nome (raro) non
 * prendono lo stesso ritratto.
 */
export function matchPortraits(
  cast: TmdbCastMember[],
  tvmaze: TvmazeCastEntry[],
): Map<number, CharacterPortrait> {
  const out = new Map<number, CharacterPortrait>();
  const byPerson = new Map<string, TvmazeCastEntry[]>();
  const byCharacter = new Map<string, TvmazeCastEntry[]>();
  for (const entry of tvmaze) {
    if (!entry.image) continue;
    const p = normalizeName(entry.personName);
    byPerson.set(p, [...(byPerson.get(p) ?? []), entry]);
    for (const form of characterForms(entry.characterName)) {
      byCharacter.set(form, [...(byCharacter.get(form) ?? []), entry]);
    }
  }
  const used = new Set<TvmazeCastEntry>();
  const take = (candidates: TvmazeCastEntry[] | undefined) =>
    candidates?.find((c) => !used.has(c)) ?? null;

  for (const member of cast) {
    let found = take(byPerson.get(normalizeName(member.name)));
    if (!found) {
      for (const form of characterForms(member.character)) {
        found = take(byCharacter.get(form));
        if (found) break;
      }
    }
    if (!found || !found.image) continue;
    used.add(found);
    out.set(member.id, {
      personId: member.id,
      image: found.image,
      characterName:
        primaryCharacter(found.characterName) || primaryCharacter(member.character),
    });
  }
  return out;
}
