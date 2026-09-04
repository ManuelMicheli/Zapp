/** Colore per genere TMDB (nome it-IT). Fallback grigio. */
export const GENRE_COLORS: Record<string, string> = {
  Azione: "#f43f5e",
  Avventura: "#10b981",
  Animazione: "#f472b6",
  Commedia: "#facc15",
  Crime: "#f97316",
  Documentario: "#a3a3a3",
  Dramma: "#3b82f6",
  Famiglia: "#fbbf24",
  Fantasy: "#8b5cf6",
  Storia: "#a16207",
  Horror: "#7f1d1d",
  Musica: "#d946ef",
  Mistero: "#6366f1",
  Romance: "#fb7185",
  Fantascienza: "#22d3ee",
  "Televisione film": "#64748b",
  Thriller: "#ef4444",
  Guerra: "#78716c",
  Western: "#b45309",
  // generi TV
  "Action & Adventure": "#f43f5e",
  Kids: "#fbbf24",
  News: "#a3a3a3",
  Reality: "#d946ef",
  "Sci-Fi & Fantasy": "#22d3ee",
  Soap: "#fb7185",
  Talk: "#64748b",
  "War & Politics": "#78716c",
};

export function genreColor(name: string): string {
  return GENRE_COLORS[name] ?? "#6e6e73";
}
