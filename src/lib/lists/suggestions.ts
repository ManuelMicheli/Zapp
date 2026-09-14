import "server-only";

import { getViewer } from "@/lib/auth/viewer";
import { rateLimit } from "@/lib/rate-limit";
import { getCandidates } from "@/lib/rank/candidates";
import { qualitaDi } from "@/lib/rank/affinity";
import { explain } from "@/lib/rank/explain";
import { getRankLabels, rankContext } from "@/lib/rank/engine";
import type { Db, RankCandidate } from "@/lib/rank/types";
import { createClient } from "@/lib/supabase/server";
import { getPersonalizationEnabled } from "@/lib/taste/queries";
import { isUuid } from "@/lib/validate";
import { parseListRecommendationProfile } from "./suggestion-profile";
import { rankEligibleSuggestions } from "./suggestion-ranking";
import type { ListSuggestedTitle, ListSuggestionsResult } from "./suggestion-types";

const PER_TYPE = 24;
const TOTAL = PER_TYPE * 2;
const ELIGIBILITY_CHUNK = 600;
const GENERIC_ERROR = "Non riesco a caricare i suggerimenti. Riprova tra poco.";

function hasTaste(profile: ReturnType<typeof parseListRecommendationProfile>): boolean {
  if (!profile) return false;
  return [
    profile.vector.generi,
    profile.vector.decenni,
    profile.vector.provider,
    profile.vector.persone,
    profile.vector.tipo,
    profile.vector.runtime,
    profile.vector.lingua,
  ].some((dimension) => dimension.size > 0);
}

async function eligibleKeys(
  db: Db,
  listId: string,
  candidates: readonly RankCandidate[],
): Promise<Set<string>> {
  const requested = candidates.map((candidate) => ({
    id: candidate.id,
    mediaType: candidate.mediaType,
  }));
  const allowed = new Set<string>();
  for (let start = 0; start < requested.length; start += ELIGIBILITY_CHUNK) {
    const chunk = requested.slice(start, start + ELIGIBILITY_CHUNK);
    const { data, error } = await db.rpc("list_recommendation_eligible", {
      p_list_id: listId,
      p_candidates: chunk,
    });
    if (error || !Array.isArray(data))
      throw new Error(error?.message ?? "invalid eligibility");
    for (const row of data) {
      if (!row || typeof row !== "object") throw new Error("invalid eligibility row");
      const value = row as Record<string, unknown>;
      const id = Number(value.title_id);
      const mediaType = value.media_type;
      if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        (mediaType !== "movie" && mediaType !== "tv")
      ) {
        throw new Error("invalid eligibility row");
      }
      allowed.add(`${mediaType}-${id}`);
    }
  }
  return allowed;
}

function toDto(item: RankCandidate, reason: string | null): ListSuggestedTitle {
  return {
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath,
    year: item.year,
    reason,
  };
}

export async function getListSuggestions(listId: string): Promise<ListSuggestionsResult> {
  const empty: ListSuggestionsResult = {
    items: [],
    mode: "personal",
    personalized: false,
    contributorCount: 0,
  };
  if (!isUuid(listId)) return { ...empty, error: "Lista non valida." };

  try {
    const viewer = await getViewer();
    if (!viewer) return { ...empty, error: "Accedi per vedere i suggerimenti." };
    if (
      !(await rateLimit(`list:suggestions:${viewer.id}`, 20, 60, { condiviso: true }))
    ) {
      return { ...empty, error: "Troppe richieste. Riprova tra un minuto." };
    }

    const db = await createClient();
    const { data, error } = await db.rpc("list_recommendation_profile", {
      p_list_id: listId,
    });
    if (error) return { ...empty, error: GENERIC_ERROR };
    const profile = parseListRecommendationProfile(data);
    if (!profile) return { ...empty, error: GENERIC_ERROR };

    const mode = profile.memberCount > 1 ? "shared" : "personal";
    const personalizationEnabled =
      mode === "personal" ? await getPersonalizationEnabled() : false;
    const includeSocial = mode === "personal" && personalizationEnabled;
    const context = includeSocial
      ? await rankContext(viewer.id, db)
      : {
          db,
          userId: viewer.id,
          inLibreria: new Set<string>(),
          generiDiRipiego: [],
        };
    const [movies, tv] = await Promise.all([
      getCandidates("movie", profile.vector, context, { includeSocial }),
      getCandidates("tv", profile.vector, context, { includeSocial }),
    ]);
    const candidates = [...movies, ...tv];
    const allowed = await eligibleKeys(db, listId, candidates);
    const ranked = [
      ...rankEligibleSuggestions(movies, profile.vector, allowed, PER_TYPE),
      ...rankEligibleSuggestions(tv, profile.vector, allowed, PER_TYPE),
    ]
      .sort(
        (a, b) =>
          b.punteggio - a.punteggio ||
          a.mediaType.localeCompare(b.mediaType) ||
          a.id - b.id,
      )
      .slice(0, TOTAL);
    const personalized = profile.contributorCount > 0 && hasTaste(profile);

    let items: ListSuggestedTitle[];
    if (mode === "shared") {
      const reason = personalized
        ? "In sintonia con i gusti della lista"
        : "Selezione generale";
      items = ranked.map((item) => toDto(item, reason));
    } else {
      const labels = await Promise.all([getRankLabels("movie"), getRankLabels("tv")]);
      items = ranked.map((item) =>
        toDto(
          item,
          personalized
            ? explain(
                item.contributi,
                item.mediaType === "movie" ? labels[0] : labels[1],
                qualitaDi(item),
                item.friends,
              )
            : "Selezione generale",
        ),
      );
    }

    return {
      items,
      mode,
      personalized,
      contributorCount: profile.contributorCount,
    };
  } catch (error) {
    console.error("[lists] suggerimenti non caricati:", error);
    return { ...empty, error: GENERIC_ERROR };
  }
}
