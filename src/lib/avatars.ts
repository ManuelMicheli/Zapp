/**
 * Avatar predefiniti: silhouette **bianca su trasparente** generate da
 * `docs/design/brand/avatars` (script `scripts/generate-avatars.mjs`) e servite
 * da `public/avatars/<id>.png`. Lo sfondo NON è nel PNG: lo dipinge chi rende
 * l'avatar (`Avatar`, `AvatarPicker`) con `avatarBackgroundCss`, così l'utente
 * può scegliere un colore pieno o una sfumatura fra due colori.
 *
 * In `profiles.avatar_url` l'avatar predefinito è `/avatars/<id>.png` seguito da
 * `?bg=<hex>` (pieno) o `?bg=<hex>&bg2=<hex>` (sfumatura); senza query lo sfondo è
 * nero. Nessuna colonna in più: ogni query che legge `avatar_url` porta già
 * anche lo sfondo.
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

/** Sfondo dell'avatar: colore pieno (`to` assente) o sfumatura `from` → `to`. */
export interface AvatarBackground {
  from: string;
  to?: string;
}

/** Sfondo di default: nero, silhouette bianca. */
export const DEFAULT_AVATAR_BACKGROUND: AvatarBackground = { from: "#000000" };

/** Colori rapidi proposti nel foglio, prima dei selettori liberi. */
export const AVATAR_COLOR_SWATCHES: string[] = [
  "#000000",
  "#1d4ed8",
  "#7c3aed",
  "#db2777",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#475569",
];

/** Sfumature rapide proposte nel foglio. */
export const AVATAR_GRADIENT_SWATCHES: AvatarBackground[] = [
  { from: "#7c3aed", to: "#db2777" },
  { from: "#1d4ed8", to: "#0891b2" },
  { from: "#dc2626", to: "#ea580c" },
  { from: "#16a34a", to: "#ca8a04" },
  { from: "#0f172a", to: "#7c3aed" },
  { from: "#db2777", to: "#ea580c" },
];

const HEX_RE = /^#[0-9a-f]{6}$/;

/** Normalizza un colore `#rrggbb` (minuscolo, con `#`); altro → null. */
export function normalizeHexColor(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  const hex = s.startsWith("#") ? s : `#${s}`;
  return HEX_RE.test(hex) ? hex : null;
}

/** Valida uno sfondo arrivato dal client; forma sbagliata → null. */
export function parseAvatarBackground(input: unknown): AvatarBackground | null {
  if (!input || typeof input !== "object") return null;
  const o = input as { from?: unknown; to?: unknown };
  const from = normalizeHexColor(typeof o.from === "string" ? o.from : null);
  if (!from) return null;
  if (o.to == null || o.to === "") return { from };
  const to = normalizeHexColor(typeof o.to === "string" ? o.to : null);
  return to ? { from, to } : null;
}

/** Valore CSS `background` per lo sfondo (pieno o sfumatura diagonale). */
export function avatarBackgroundCss(bg: AvatarBackground): string {
  return bg.to ? `linear-gradient(135deg, ${bg.from} 0%, ${bg.to} 100%)` : bg.from;
}

/** Percorso pubblico del PNG (silhouette trasparente) dell'avatar predefinito. */
export function presetAvatarSrc(id: string): string {
  return `/avatars/${id}.png`;
}

/** URL da salvare in `profiles.avatar_url`: percorso + sfondo nella query. */
export function presetAvatarUrl(id: string, bg: AvatarBackground): string {
  const params = new URLSearchParams({ bg: bg.from.slice(1) });
  if (bg.to) params.set("bg2", bg.to.slice(1));
  return `${presetAvatarSrc(id)}?${params.toString()}`;
}

/** True se l'id è uno degli avatar predefiniti (usato per validare le azioni). */
export function isPresetAvatarId(id: string): boolean {
  return PRESET_AVATARS.some((a) => a.id === id);
}

export interface ParsedPresetAvatar {
  id: string;
  bg: AvatarBackground;
}

/**
 * Avatar predefinito (id + sfondo) corrispondente all'URL salvato, se lo è.
 * Query assente o non valida → sfondo nero.
 */
export function parsePresetAvatar(url: string | null): ParsedPresetAvatar | null {
  if (!url?.startsWith("/avatars/")) return null;
  const q = url.indexOf("?");
  const pathPart = q < 0 ? url : url.slice(0, q);
  const id = pathPart.slice("/avatars/".length).replace(/\.png$/, "");
  if (!isPresetAvatarId(id)) return null;
  const params = new URLSearchParams(q < 0 ? "" : url.slice(q + 1));
  const bg =
    parseAvatarBackground({ from: params.get("bg"), to: params.get("bg2") }) ??
    DEFAULT_AVATAR_BACKGROUND;
  return { id, bg };
}

/** Id dell'avatar predefinito corrispondente all'URL salvato, se lo è. */
export function presetAvatarId(url: string | null): string | null {
  return parsePresetAvatar(url)?.id ?? null;
}
