"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { isMediaType, isTmdbId, isUuid } from "@/lib/validate";
import { romeDateString } from "@/lib/cinema/dates";
import { cleanReason } from "./rank";
import { getDailyAnswers, getTodayQuestion, type DailyAnswerItem } from "./queries";

export interface DailyResult {
  ok: boolean;
  error?: string;
}

/** Messaggio unico verso il client: il dettaglio PostgREST resta nei log. */
const GENERIC_ERROR = "Non è riuscito, riprova.";
const INVALID: DailyResult = { ok: false, error: "Richiesta non valida." };
const TOO_MANY: DailyResult = {
  ok: false,
  error: "Troppe richieste, riprova più tardi.",
};
const NO_SESSION: DailyResult = { ok: false, error: "Devi aver fatto accesso." };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, user };
}

/**
 * Risponde alla domanda di oggi (o cambia la risposta già data).
 *
 * Gli argomenti arrivano da chiunque abbia una sessione, non dal nostro
 * componente: si validano tutti. `question_id` non si accetta mai dal client,
 * lo legge il server; il vincolo "solo la domanda di oggi" sta anche nella RLS.
 */
export async function answerDailyQuestion(
  titleId: unknown,
  mediaType: unknown,
  reason: unknown,
): Promise<DailyResult> {
  const session = await requireUser();
  if (!session) return NO_SESSION;
  const { supabase, user } = session;
  if (!isTmdbId(titleId) || !isMediaType(mediaType)) return INVALID;
  const text = cleanReason(reason);

  // una risposta al giorno per regola; il limite è contro il pestaggio dell'endpoint
  if (!(await rateLimit(`daily-answer:${user.id}`, 20, 3600))) return TOO_MANY;

  const question = await getTodayQuestion();
  if (!question) return { ok: false, error: "Oggi non c'è nessuna domanda." };
  if (question.mediaScope !== "any" && question.mediaScope !== mediaType) return INVALID;

  // la FK composta su `titles` esige la riga: la si scarica ora, e da qui in poi
  // è in cache per tutti
  const title = await getOrFetchTitle(titleId, mediaType);
  if (!title) return { ok: false, error: GENERIC_ERROR };

  const { error } = await supabase.from("daily_answers").upsert(
    {
      question_id: question.id,
      user_id: user.id,
      title_id: titleId,
      media_type: mediaType,
      reason: text,
    },
    { onConflict: "question_id,user_id" },
  );
  if (error) {
    console.error("answerDailyQuestion", error);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath("/");
  return { ok: true };
}

/** "Il popup di oggi l'ho visto": si scrive alla chiusura o all'invio. */
export async function markDailyQuestionSeen(): Promise<void> {
  try {
    const session = await requireUser();
    if (!session) return;
    await session.supabase
      .from("daily_question_views")
      .upsert(
        { user_id: session.user.id, ask_on: romeDateString() },
        { onConflict: "user_id,ask_on", ignoreDuplicates: true },
      );
  } catch (e) {
    // non deve mai rompere la chiusura del popup
    console.error("markDailyQuestionSeen", e);
  }
}

/** Segnala il motivo di una risposta: 3 segnalazioni distinte e sparisce. */
export async function reportDailyAnswer(answerId: unknown): Promise<DailyResult> {
  const session = await requireUser();
  if (!session) return NO_SESSION;
  const { supabase, user } = session;
  if (!isUuid(answerId)) return INVALID;
  if (!(await rateLimit(`daily-report:${user.id}`, 10, 3600))) return TOO_MANY;

  const { error } = await supabase.from("reports").upsert(
    {
      target_type: "daily_answer",
      target_id: answerId,
      reporter_id: user.id,
    },
    { onConflict: "target_type,target_id,reporter_id", ignoreDuplicates: true },
  );
  if (error) {
    console.error("reportDailyAnswer", error);
    return { ok: false, error: GENERIC_ERROR };
  }
  return { ok: true };
}

/** L'elenco per il pannello: chiesto solo quando il pannello si apre. */
export async function fetchDailyAnswers(): Promise<DailyAnswerItem[]> {
  return getDailyAnswers();
}
