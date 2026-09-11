import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import type { Saga } from "@/lib/sagas/order";
import { SagaMovies } from "./SagaMovies";

export async function SagaProgress({ saga }: { saga: Saga }) {
  const viewer = await getViewer();
  let watchedIds: number[] | null = null;
  if (viewer) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("watch_entries")
      .select("title_id")
      .eq("user_id", viewer.id)
      .eq("media_type", "movie")
      .eq("status", "watched")
      .in("title_id", saga.movieIds);
    if (error) console.error("[sagas] lettura progresso", error);
    else watchedIds = (data ?? []).map((entry) => entry.title_id);
  }
  return <SagaMovies saga={saga} watchedIds={watchedIds} />;
}
