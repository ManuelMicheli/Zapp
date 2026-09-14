import type { TmdbCastMember } from "@/lib/tmdb/types";

/**
 * Il grafico del personaggio preferito, calcolato a partire dai conteggi aggregati
 * (una riga per persona votata) e dal cast di `titles.raw`. Puro: si prova con Vitest.
 */

/** Una riga aggregata: quanti hanno scelto questa persona per questo titolo. */
export interface CharacterVoteCount {
  /** Id TMDB della persona (`cast[].id`). */
  personId: number;
  /** Nome del personaggio al momento del voto: sopravvive a un cambio del cast. */
  character: string;
  votes: number;
}

export interface CharacterBar {
  personId: number;
  /** Nome dell'interprete, nullo se non sta più nel cast. */
  name: string | null;
  character: string;
  profilePath: string | null;
  votes: number;
  /** Percentuale intera sul totale dei voti. */
  share: number;
  /** È il voto di chi guarda. */
  mine: boolean;
}

export interface CharacterChart {
  total: number;
  bars: CharacterBar[];
  /** I voti oltre le barre mostrate, sommati; nullo se non ce ne sono. */
  others: { votes: number; share: number } | null;
}

/** Quante barre stanno nel grafico prima di "altri". */
export const TOP_BARS = 5;

/** Il primo nome quando TMDB ne elenca più d'uno ("Walter White Jr. / Flynn"). */
export function primaryCharacter(character: string | null | undefined): string {
  return cleanCharacter((character ?? "").split("/")[0]);
}

/**
 * Toglie le note fra parentesi che TMDB attacca al personaggio: "(voice)",
 * "(uncredited)", "(archive footage)". "Light Yagami (voice)" → "Light Yagami".
 */
export function cleanCharacter(character: string | null | undefined): string {
  return (character ?? "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function share(votes: number, total: number): number {
  return total > 0 ? Math.round((votes / total) * 100) : 0;
}

export function buildCharacterChart(
  counts: CharacterVoteCount[],
  cast: TmdbCastMember[],
  myPersonId: number | null,
  top = TOP_BARS,
): CharacterChart {
  const castIndex = new Map(cast.map((member, index) => [member.id, index]));
  const positive = counts.filter((row) => row.votes > 0);
  const total = positive.reduce((sum, row) => sum + row.votes, 0);
  if (total === 0) return { total: 0, bars: [], others: null };

  const ordered = [...positive].sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    const ia = castIndex.get(a.personId) ?? Number.MAX_SAFE_INTEGER;
    const ib = castIndex.get(b.personId) ?? Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return a.character.localeCompare(b.character, "it");
  });

  // le prime `top`, più la mia se sta oltre: il proprio voto si deve sempre vedere
  const shown = ordered.slice(0, top);
  if (myPersonId !== null && !shown.some((row) => row.personId === myPersonId)) {
    const mine = ordered.find((row) => row.personId === myPersonId);
    if (mine) shown.push(mine);
  }

  const bars: CharacterBar[] = shown.map((row) => {
    const member = cast[castIndex.get(row.personId) ?? -1];
    return {
      personId: row.personId,
      name: member?.name ?? null,
      character: member?.character ? primaryCharacter(member.character) : row.character,
      profilePath: member?.profile_path ?? null,
      votes: row.votes,
      share: share(row.votes, total),
      mine: row.personId === myPersonId,
    };
  });

  const shownVotes = shown.reduce((sum, row) => sum + row.votes, 0);
  const rest = total - shownVotes;
  return {
    total,
    bars,
    others: rest > 0 ? { votes: rest, share: share(rest, total) } : null,
  };
}

/**
 * Sposta un voto nei conteggi locali, per l'aggiornamento istantaneo del grafico:
 * `previous` → `next` (nullo = nessun voto). Non muta l'elenco di partenza.
 */
export function applyVote(
  counts: CharacterVoteCount[],
  previous: number | null,
  next: number | null,
  nextCharacter: string | null,
): CharacterVoteCount[] {
  if (previous === next) return counts;
  let out = counts.map((row) => ({ ...row }));
  if (previous !== null) {
    out = out
      .map((row) => (row.personId === previous ? { ...row, votes: row.votes - 1 } : row))
      .filter((row) => row.votes > 0);
  }
  if (next !== null) {
    const existing = out.find((row) => row.personId === next);
    if (existing) existing.votes += 1;
    else out.push({ personId: next, character: nextCharacter ?? "", votes: 1 });
  }
  return out;
}
