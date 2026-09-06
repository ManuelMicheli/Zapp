/**
 * Avatar predefiniti: icone (silhouette bianca su sfumatura) generate da
 * `public/icons/icona profilo*.png` e servite da `public/avatars/<id>.png`.
 * Lo sfondo è già dentro il PNG, così ogni `<Image>` che mostra un avatar
 * (profilo, amici, recensioni, feed) funziona senza casi speciali.
 */
export interface PresetAvatar {
  id: string;
  /** Personaggio a cui si ispira l'icona, mostrato sotto la scelta. */
  name: string;
}

export const PRESET_AVATARS: PresetAvatar[] = [
  { id: "batman", name: "Batman" },
  { id: "superman", name: "Superman" },
  { id: "wonder-woman", name: "Wonder Woman" },
  { id: "spider-man", name: "Spider-Man" },
  { id: "iron-man", name: "Iron Man" },
  { id: "flash", name: "Flash" },
  { id: "lanterna-verde", name: "Lanterna Verde" },
  { id: "cyborg", name: "Cyborg" },
  { id: "joker", name: "Joker" },
  { id: "harley-quinn", name: "Harley Quinn" },
  { id: "dracula", name: "Dracula" },
  { id: "frankenstein", name: "Frankenstein" },
  { id: "strega", name: "Strega" },
  { id: "assassino", name: "Assassino" },
  { id: "re", name: "Re" },
  { id: "principessa", name: "Principessa" },
  { id: "principe", name: "Principe" },
  { id: "classico", name: "Classico" },
];

/** Percorso pubblico dell'avatar predefinito. */
export function presetAvatarSrc(id: string): string {
  return `/avatars/${id}.png`;
}

/** True se l'id è uno degli avatar predefiniti (usato per validare le azioni). */
export function isPresetAvatarId(id: string): boolean {
  return PRESET_AVATARS.some((a) => a.id === id);
}

/** Id dell'avatar predefinito corrispondente all'URL salvato, se lo è. */
export function presetAvatarId(url: string | null): string | null {
  if (!url?.startsWith("/avatars/")) return null;
  const id = url.slice("/avatars/".length).replace(/\.png$/, "");
  return isPresetAvatarId(id) ? id : null;
}
