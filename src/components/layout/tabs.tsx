/**
 * Voci della navigazione. Su mobile ognuna mostra l'icona del set del marchio
 * (`public/icons/nav/*.png`, ritagliate da `public/icons/ICONE UI-*.png` con la stessa
 * scala per tutte, vedi scripts/generate-nav-icons.mjs): sono nere su trasparente, così
 * la nav le rende come maschera colorata con `currentColor` e seguono lo stato attivo.
 * Da lg restano solo le etichette, niente icone.
 *
 * **L'ordine è la barra**: cinque voci, la Z della Home esattamente al centro
 * (Cerca, Libreria | Home | Cinema, Profilo). Amici non è più una voce: si arriva alla
 * pagina dal profilo, che è la sezione a cui appartiene (richiesta utente 2026-09-08).
 *
 * `prefetchFull: false` = solo il `loading.tsx` (prefetch "auto" di Next). La nav è
 * sempre nel viewport, quindi il prefetch pieno di una voce parte a **ogni pagina**
 * dell'app: per /cinema significherebbe far girare sul server, di continuo, le pagine
 * MyMovies e i link biglietteria di chi non sta nemmeno andando lì. Le altre voci
 * costano una query e restano a prefetch pieno.
 */
export const TABS = [
  { href: "/search", label: "Cerca", icon: "/icons/nav/search.png", prefetchFull: true },
  {
    href: "/library",
    label: "Libreria",
    icon: "/icons/nav/library.png",
    prefetchFull: true,
  },
  { href: "/", label: "Home", icon: "/icons/nav/home.png", prefetchFull: true },
  {
    href: "/cinema",
    label: "Cinema",
    icon: "/icons/nav/cinema.png",
    prefetchFull: false,
  },
  {
    href: "/profile",
    label: "Profilo",
    icon: "/icons/nav/profile.png",
    prefetchFull: true,
  },
] as const;
