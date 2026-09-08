import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { previousDay, romeDateString } from "@/lib/cinema/dates";
import {
  buildPodium,
  topReason,
  type PodiumCount,
  type PodiumEntry,
  type ReasonSource,
} from "./rank";

export interface DailyQuestionRow {
  id: string;
  text: string;
  mediaScope: "movie" | "tv" | "any";
}

export interface MyAnswer {
  titleId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  reason: string | null;
}

export interface Podium {
  /** Il testo della domanda di ieri: senza, il podio non si capisce. */
  question: string;
  day: string;
  entries: PodiumEntry[];
  reason: ReasonSource | null;
}

export interface DailyAnswerItem {
  id: string;
  titleId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  reason: string | null;
  createdAt: string;
  /** "Un utente" quando il profilo è privato: le policy non lo mostrano agli estranei. */
  authorName: string;
  authorUsername: string | null;
  authorAvatar: string | null;
  mine: boolean;
}

/** Colonne del titolo che servono a podio ed elenco: mai `raw` (27 KB a riga). */
const TITLE_COLS = "id, media_type, title, poster_path, backdrop_path";

/** PostgREST tipizza gli embed come oggetto o array secondo la relazione. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** La domanda di oggi (Europe/Rome). Una lettura per richiesta. */
export const getTodayQuestion = cache(async (): Promise<DailyQuestionRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_questions")
    .select("id, text, media_scope")
    .eq("ask_on", romeDateString())
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    text: data.text,
    mediaScope: data.media_scope as DailyQuestionRow["mediaScope"],
  };
});

/**
 * La mia risposta di oggi. Il join `!inner` sulla domanda evita di aspettare
 * `getTodayQuestion`: così la lettura parte in parallelo alle altre.
 */
export async function getMyAnswer(): Promise<MyAnswer | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_answers")
    .select(
      `title_id, media_type, reason,
       question:daily_questions!inner(ask_on),
       title:titles!daily_answers_title_id_media_type_fkey(${TITLE_COLS})`,
    )
    .eq("user_id", viewer.id)
    .eq("question.ask_on", romeDateString())
    .maybeSingle();
  const title = one(data?.title);
  if (!data || !title) return null;
  return {
    titleId: Number(data.title_id),
    mediaType: data.media_type,
    title: title.title,
    posterPath: title.poster_path,
    reason: data.reason,
  };
}

/** Il popup di oggi è già stato aperto? (riga in `daily_question_views`) */
export async function hasSeenToday(): Promise<boolean> {
  const viewer = await getViewer();
  if (!viewer) return true;
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_question_views")
    .select("ask_on")
    .eq("user_id", viewer.id)
    .eq("ask_on", romeDateString())
    .maybeSingle();
  return data != null;
}

/**
 * I conteggi del podio di un giorno chiuso non cambiano più: si calcolano una
 * volta per tutti e restano in cache con la data come chiave. Dentro
 * `unstable_cache` non si possono leggere i cookie, quindi qui va il service
 * client; la RPC ritorna **solo numeri**, nessun dato personale (i motivi e i
 * nomi si leggono più sotto con la sessione dell'utente, così chi ha bloccato
 * qualcuno continua a non vederne le righe).
 */
const cachedCounts = (day: string) =>
  unstable_cache(
    async (): Promise<PodiumCount[]> => {
      const supabase = createServiceClient();
      const { data } = await supabase.rpc("daily_question_podium", { day });
      return (data ?? []).map((r) => ({
        titleId: Number(r.title_id),
        mediaType: r.media_type,
        votes: Number(r.votes),
        firstAt: r.first_at,
      }));
    },
    ["daily-podium", day],
    { revalidate: 60 * 60 * 24 * 30 },
  )();

export async function getYesterdayPodium(): Promise<Podium | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const day = previousDay(romeDateString());
  const supabase = await createClient();

  const [counts, questionRes] = await Promise.all([
    cachedCounts(day),
    supabase.from("daily_questions").select("id, text").eq("ask_on", day).maybeSingle(),
  ]);
  const question = questionRes.data;
  if (!question || counts.length === 0) return null;

  const ids = counts.map((c) => c.titleId);
  const [titlesRes, answersRes] = await Promise.all([
    supabase.from("titles").select(TITLE_COLS).in("id", ids),
    supabase
      .from("daily_answers")
      .select(
        `title_id, media_type, reason, created_at,
         author:profiles(display_name, username, avatar_url)`,
      )
      .eq("question_id", question.id)
      .not("reason", "is", null)
      .in("title_id", ids)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);

  const entries = buildPodium(
    counts,
    (titlesRes.data ?? []).map((t) => ({
      titleId: Number(t.id),
      mediaType: t.media_type,
      title: t.title,
      posterPath: t.poster_path,
      backdropPath: t.backdrop_path,
    })),
  );
  const sources: ReasonSource[] = (answersRes.data ?? []).map((a) => {
    const author = one(a.author);
    return {
      titleId: Number(a.title_id),
      mediaType: a.media_type,
      reason: a.reason,
      createdAt: a.created_at,
      authorName: author?.display_name ?? author?.username ?? null,
      authorAvatar: author?.avatar_url ?? null,
    };
  });

  return { question: question.text, day, entries, reason: topReason(sources, entries[0]) };
}

/**
 * Le risposte di oggi, **dalla più recente**: mai per voti, perché una
 * classifica parziale in giornata farebbe rispondere guardando i risultati.
 */
export async function getDailyAnswers(limit = 60): Promise<DailyAnswerItem[]> {
  const [viewer, question] = await Promise.all([getViewer(), getTodayQuestion()]);
  if (!viewer || !question) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_answers")
    .select(
      `id, title_id, media_type, reason, created_at, user_id,
       author:profiles(display_name, username, avatar_url),
       title:titles!daily_answers_title_id_media_type_fkey(${TITLE_COLS})`,
    )
    .eq("question_id", question.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).flatMap((row) => {
    const title = one(row.title);
    const author = one(row.author);
    if (!title) return [];
    return [
      {
        id: row.id,
        titleId: Number(row.title_id),
        mediaType: row.media_type,
        title: title.title,
        posterPath: title.poster_path,
        reason: row.reason,
        createdAt: row.created_at,
        // profilo privato: le policy non lo restituiscono agli estranei
        authorName: author?.display_name ?? author?.username ?? "Un utente",
        authorUsername: author?.username ?? null,
        authorAvatar: author?.avatar_url ?? null,
        mine: row.user_id === viewer.id,
      },
    ];
  });
}
