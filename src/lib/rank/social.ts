import "server-only";

import type { Db, MediaType, RankCandidate, SocialSignal } from "./types";

/**
 * Il segnale sociale: cosa hanno visto gli amici (fase E).
 *
 * **La privacy la fa il database.** `watch_entries` ha già la policy
 * `watch_entries_select_friends` (`are_friends(auth.uid(), user_id) and not is_private`),
 * quindi una query normale fatta con il client a cookie restituisce esattamente ciò che
 * l'utente ha diritto di vedere. Per questo qui non c'è nessuna `where` sull'amicizia —
 * e soprattutto **nessun service client**: sarebbe l'unico modo di sbagliare, perché
 * scavalcherebbe la policy e mostrerebbe le liste private di sconosciuti.
 */

/** Quanto indietro guardare: oltre, "l'ha visto un amico" non è più una notizia. */
const GIORNI = 180;
/** Quante entry leggere: gli amici di un utente non sono un catalogo. */
const LIMITE = 600;
/** Nomi mostrati nel motivo. */
const NOMI_MOSTRATI = 3;
/** Da questo voto in su un titolo finito da un amico diventa anche un candidato. */
export const VOTO_CONSIGLIABILE = 7;

interface RigaAmico {
  title_id: number;
  media_type: MediaType;
  status: string | null;
  rating: number | null;
  user_id: string;
  last_watched_at: string | null;
  profiles: { display_name: string | null; username: string } | null;
  titles: {
    id: number;
    media_type: MediaType;
    title: string;
    poster_path: string | null;
    backdrop_path: string | null;
    overview: string | null;
    release_date: string | null;
    runtime: number | null;
    genres: unknown;
  } | null;
}

function generiDi(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => (g && typeof g === "object" ? (g as { id?: unknown }).id : null))
    .filter((id): id is number => typeof id === "number");
}

export interface SocialeLetto {
  /** Chiave `tipo-id` → segnale. */
  segnali: Map<string, SocialSignal>;
  /** I titoli che un amico ha finito e votato bene: candidati a pieno titolo. */
  candidati: RankCandidate[];
}

export async function getSocialSignals(db: Db, userId: string): Promise<SocialeLetto> {
  const dopo = new Date(Date.now() - GIORNI * 86_400_000).toISOString();
  const { data, error } = await db
    .from("watch_entries")
    .select(
      "title_id, media_type, status, rating, user_id, last_watched_at, profiles!watch_entries_user_id_fkey(display_name, username), titles!watch_entries_title_id_media_type_fkey(id, media_type, title, poster_path, backdrop_path, overview, release_date, runtime, genres)",
    )
    .neq("user_id", userId)
    .in("status", ["watched", "watching"])
    .gte("last_watched_at", dopo)
    .order("last_watched_at", { ascending: false })
    .limit(LIMITE);

  if (error) {
    // Un errore qui toglierebbe il segnale sociale senza che nulla si rompa: senza
    // questo log, "nessun amico ha visto niente" e "la query è saltata" sarebbero
    // indistinguibili.
    console.error("[rank] segnale sociale non letto:", error.message);
    return { segnali: new Map(), candidati: [] };
  }

  const accumulo = new Map<
    string,
    { amici: Set<string>; voti: number[]; nomi: string[]; riga: RigaAmico }
  >();

  for (const r of (data ?? []) as unknown as RigaAmico[]) {
    const k = `${r.media_type}-${r.title_id}`;
    const nome = r.profiles?.display_name?.trim() || r.profiles?.username;
    const voce = accumulo.get(k) ?? {
      amici: new Set<string>(),
      voti: [],
      nomi: [],
      riga: r,
    };
    if (!voce.amici.has(r.user_id)) {
      voce.amici.add(r.user_id);
      if (nome && voce.nomi.length < NOMI_MOSTRATI) voce.nomi.push(nome);
    }
    if (r.rating !== null) voce.voti.push(r.rating);
    accumulo.set(k, voce);
  }

  const segnali = new Map<string, SocialSignal>();
  const candidati: RankCandidate[] = [];

  for (const [k, voce] of accumulo) {
    const votoMedio =
      voce.voti.length > 0
        ? voce.voti.reduce((a, b) => a + b, 0) / voce.voti.length
        : null;
    segnali.set(k, { amici: voce.amici.size, votoMedio, nomi: voce.nomi });

    // Un titolo che un amico ha finito e votato bene è un candidato anche se non sta in
    // nessuna classifica e in nessun `discover`: è l'unica fonte che sa qualcosa che
    // TMDB non sa.
    const t = voce.riga.titles;
    if (!t?.poster_path) continue;
    if (votoMedio === null || votoMedio < VOTO_CONSIGLIABILE) continue;
    candidati.push({
      id: t.id,
      mediaType: t.media_type,
      title: t.title,
      posterPath: t.poster_path,
      backdropPath: t.backdrop_path,
      overview: t.overview?.trim() || null,
      year: t.release_date ? t.release_date.slice(0, 4) : null,
      genreIds: generiDi(t.genres),
      runtime: t.runtime,
      originalLanguage: null,
      providerIds: [],
      people: [],
      zappScore: null,
      voteAverage: null,
      voteCount: null,
      friends: segnali.get(k) ?? null,
    });
  }

  return { segnali, candidati };
}
