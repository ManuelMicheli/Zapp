/**
 * Voci della navigazione. Su mobile ognuna mostra l'icona del set del marchio
 * (`public/icons/nav/*.png`, ritagliate da `public/icons/ICONE UI-*.png` con la stessa
 * scala per tutte, vedi scripts/generate-nav-icons.mjs): sono nere su trasparente, così
 * la nav le rende come maschera colorata con `currentColor` e seguono lo stato attivo.
 * Da lg restano solo le etichette, niente icone.
 */
export const TABS = [
  { href: "/", label: "Home", icon: "/icons/nav/home.png" },
  { href: "/search", label: "Cerca", icon: "/icons/nav/search.png" },
  { href: "/library", label: "Libreria", icon: "/icons/nav/library.png" },
  { href: "/cinema", label: "Cinema", icon: "/icons/nav/cinema.png" },
  { href: "/friends", label: "Amici", icon: "/icons/nav/friends.png" },
  { href: "/profile", label: "Profilo", icon: "/icons/nav/profile.png" },
] as const;
