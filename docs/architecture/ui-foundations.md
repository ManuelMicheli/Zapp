# UI vocabulary (redesign "Cinema", 2026-09)

Mockups (source of truth for spacing/copy): `docs/design/mockups/*.dc.html`; spec:
`docs/superpowers/specs/2026-09-04-redesign-cinema-design.md`.

- **Tokens, non valori grezzi.** Raw hex solo per i colori di brand (Netflix `#E50914`)
  e per `GENRE_COLORS`. Surfaces `bg-bg` (#000), `bg-surface`, `bg-surface-2`,
  `bg-sheet`; text `text-text`, `text-muted`, `text-muted-2`; accent `accent`,
  `accent-strong` (hover/pressed), `accent-soft` (link), `accent-pale` (icone/numeri su
  fondo accent); errori `text-danger`. Definiti in `@theme` in `src/app/globals.css`.
- **Utilities** `.glass` / `.glass-strong` (blur + bordo bianco tenue) per pillole e
  bottoni sopra immagini. Card: `rounded-[20px] border border-border bg-surface`;
  campi form: `rounded-[14px] bg-surface-2`; pagine scrollabili chiudono con `pb-16`.
- **Icone**: SVG inline, `strokeWidth={1.8}`, `currentColor`. Nessuna libreria di icone.
- **Scorrimento**: `PosterCard` ha `.cv-auto` (`content-visibility: auto` + misura
  intrinseca, `globals.css`) così griglie e scaffali lunghi non pagano layout e paint
  fuori schermo. Mai `filter: blur()` sul contenitore di elementi animati (il muro lo
  applica per colonna, layer già composito con `will-change: transform`).
- **Marchio**: sorgenti in `docs/design/brand/` (`zapp-icon-tile.jpeg` = tile scuro con Z
  bianca, `zapp-z.jpeg` = solo glifo). Da lì: icone PWA `public/icons/*.png` e
  `src/app/apple-icon.png` (tile; le maskable hanno il tile al 70% su nero), favicon
  `src/app/icon.svg` (solo la Z, sfondo trasparente, nessun tile: Z sfumata scura su tema
  chiaro e bianca su scuro via `prefers-color-scheme` nell'SVG). Path della Z tracciato
  dal JPEG (soglia + contorno + Douglas-Peucker); cambiando le icone alza `?v=` in
  `manifest.ts`.
- **Icone della nav** (solo mobile): il set del marchio, sorgenti
  `docs/design/brand/ui-icons/ICONE UI-*.png` (glifo nero su trasparente, 2134px).
  `scripts/generate-nav-icons.mjs` (sharp) centra ogni glifo sul suo bounding box e lo
  ritaglia in un riquadro **della stessa misura per tutte** (`BOX`), così la scala del
  disegno — e quindi lo spessore del tratto — resta uniforme nella barra; esce una
  maschera 96px in `public/icons/nav/{home,search,library,cinema,friends,profile}.png`
  (1-3 KB l'una). `TopNav` le rende come `mask-image` su `bg-current`: prendono
  `currentColor` e seguono lo stato attivo come le vecchie SVG inline. La Z del marchio è
  la voce Home; il biglietto è Cinema. Le sorgenti stanno fuori da `public/` apposta
  (100 KB l'una: servite e precacheate dal service worker per niente).
- **Backdrop**: sempre TMDB `original`, mai `w780`/`w1280` come sfondo.
  L'immagine della banda (`CinematicBackdrop`) è `unoptimized`: nessun `srcset`, nessun
  `sizes`, il loader (`src/lib/image-loader.ts`) non riscrive la taglia e l'URL
  `original` (fino a 3840px) arriva intero a ogni larghezza. È il fotogramma che si vede
  prima del trailer e deve reggere il confronto col video (richiesta utente 2026-09-06):
  con lo `srcset` un telefono a 390px × DPR 3 scendeva a `w1280`, cioè sgranato.
  Altrove `sizes` segue la geometria di `object-cover`, non la larghezza della pagina:
  un 16:9 che copre un riquadro alto H va richiesto largo H × 16/9.
  Mai chiedere meno del necessario: un file da 1200px scalato 3× è sfocato.
