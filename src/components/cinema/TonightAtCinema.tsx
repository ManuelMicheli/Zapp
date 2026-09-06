import { getUpcomingPlan } from "@/lib/cinema/queries";
import { PlanCard } from "./PlanCard";

/** Prossima serata al cinema (da 3 h prima a 48 h dopo), se esiste. */
export async function TonightAtCinema() {
  const upcoming = await getUpcomingPlan();
  if (!upcoming) return null;
  return (
    <PlanCard
      plan={upcoming.plan}
      ticketUrl={upcoming.ticketUrl}
      userId={upcoming.userId}
    />
  );
}
