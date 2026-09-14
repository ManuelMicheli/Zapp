export type SuggestedMediaType = "movie" | "tv";

export interface ListSuggestedTitle {
  id: number;
  mediaType: SuggestedMediaType;
  title: string;
  posterPath: string;
  year: string | null;
  reason: string | null;
}

export interface ListSuggestionsResult {
  items: ListSuggestedTitle[];
  mode: "personal" | "shared";
  personalized: boolean;
  contributorCount: number;
  error?: string;
}
