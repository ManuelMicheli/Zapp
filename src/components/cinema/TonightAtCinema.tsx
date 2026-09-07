import { getHomePlan } from "@/lib/cinema/queries";
import { PlanCard } from "./PlanCard";
import { PostShowCard } from "./PostShowCard";

/**
 * La serata al cinema in home: il promemoria fino a un'ora dopo l'inizio, poi
 * — a film finito — la domanda "com'è andata?" al primo rientro nell'app.
 */
export async function TonightAtCinema() {
  const { upcoming, past } = await getHomePlan();
  if (upcoming) {
    return (
      <PlanCard
        plan={upcoming.plan}
        ticketUrl={upcoming.ticketUrl}
        userId={upcoming.userId}
      />
    );
  }
  return past ? <PostShowCard plan={past} /> : null;
}
