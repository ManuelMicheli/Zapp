import {
  getMyAnswer,
  getTodayQuestion,
  getYesterdayPodium,
  hasSeenToday,
} from "@/lib/daily/queries";
import { DailyQuestion } from "./DailyQuestion";

/**
 * Legge tutto in una sola andata (mai un await sequenziale che non serve) e
 * passa i dati al componente client. Sta dietro `Suspense` nel layout: la
 * pagina non lo aspetta.
 */
export async function DailyQuestionLauncher() {
  const [question, podium, answer, seen] = await Promise.all([
    getTodayQuestion(),
    getYesterdayPodium(),
    getMyAnswer(),
    hasSeenToday(),
  ]);
  if (!question && !podium) return null;
  return (
    <DailyQuestion question={question} podium={podium} answer={answer} seen={seen} />
  );
}
