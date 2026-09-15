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
- **Misura delle locandine**: due famiglie, entrambe in `src/components/ui/PosterCard.tsx`.
  Gli **scaffali** orizzontali hanno larghezze fisse a scalini (`SHELF_CARD_CLASS`:
  112 → 144 → 172 → 192 → 210px). Le **griglie** (libreria, ricerca, filmografia,
  generi, liste, saghe, "condividi in Zapp") sotto `lg` tengono le colonne di ciascuna
  pagina, e da `lg` in su usano tutte `POSTER_GRID_DESKTOP`: non colonne fisse ma una
  misura minima con `auto-fill`, 170/180/190px. Con le colonne fisse la card
  **rimpiccioliva mentre lo schermo cresceva** (6 colonne a 1024px = 144px, 8 a 1280px =
  136px, 10 a 1536px = 131px) e finiva più piccola degli scaffali sulla stessa pagina;
  ora resta fra 176 e 198px a ogni larghezza (scelta utente 2026-09-15). Ogni misura
  viaggia col suo `sizes` — `POSTER_GRID_SIZES`, o `POSTER_GRID_SIZES_2COL` per le
  griglie che sotto i 390px stanno a due colonne: senza, il loader chiede un'immagine
  più piccola di come viene mostrata e su desktop le copertine sgranano.
  Si collauda con `BASE=http://localhost:3399 node --env-file=.env.local
  scripts/cards-check.mjs` (istanza avviata): misura la copertina a 1024/1280/1536/1920
  su tre pagine. La prova non è la monotonia stretta — `auto-fill` ha per costruzione un
  dente di sega quando entra una colonna in più (194px a 1536, 190px a 1920) — ma il
  **pavimento**: mai sotto i 165px, mai un calo oltre un gap, mai scorrimento orizzontale.
