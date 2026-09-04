# Redesign "Cinema" — spec di design

Data: 2026-09-04. Mockup approvati dall'utente, artboard per artboard:
https://claude.ai/code/artifact/ed741ed5-5ab9-47fa-b083-3037730de8a4
Sorgenti dei mockup (HTML con stili inline, valori esatti): `docs/design/mockups/*.dc.html`.
Le immagini (`p01.jpg`, `prov8.jpg`, `bd_silo.jpg`, ...) sono locandine/loghi TMDB usati come
segnaposto: nell'app arrivano dai dati reali.

## Obiettivo

Restyling completo della UI mobile-first in stile Apple: nero assoluto, bianco, viola come colore
di personalità. Nessun cambio di dati, routing, auth o Server Actions: cambiano markup, classi e
qualche componente di presentazione. Una sola aggiunta di dato: il "muro di locandine" alimentato
da TMDB trending.

## Token (globals.css)

| token | valore | uso |
|---|---|---|
| `--color-bg` | `#000000` | sfondo pagina |
| `--color-surface` | `#0e0e12` | card (`z-card`) |
| `--color-surface-2` | `#1c1c1e` | campi input, chip pieni |
| `--color-border` | `rgba(255,255,255,0.07)` | bordo card |
| `--color-text` | `#ffffff` | testo |
| `--color-muted` | `#8e8e93` | testo secondario |
| `--color-muted-2` | `#6e6e73` | testo terziario, hint |
| `--color-accent` | `#8b5cf6` | CTA, tab attiva, progresso |
| `--color-accent-strong` | `#7c3aed` | hover CTA, gradienti |
| `--color-accent-soft` | `#a78bfa` | link, label attive |
| `--color-accent-pale` | `#c4b5fd` | voto, icone su viola |
| `--color-danger` | `#f87171` | Esci, Rimuovi |

Vetro (`.glass`): `bg-white/10 border border-white/[0.14] backdrop-blur-xl`.
Font: Inter (già self-hosted), pesi 400/500/600/700/800. Titoli con tracking negativo
(`tracking-[-0.045em]` per 34px, `-0.05em` per 56px+).
Raggi: card 20px, campi 14px, CTA pillola 27px (h 54), chip 999px, locandine 14px.
Altezza tap minima 44px; CTA 54px; nav 64px.

## Componenti condivisi

- **`PosterWall`** (nuovo, `src/components/marketing/PosterWall.tsx`): 4 colonne di locandine in
  prospettiva (`rotateX(24deg) rotateZ(-8deg)`), ogni colonna ripete 3 volte la sua lista di 4
  locandine e scorre con keyframes `translateY(0 → -33.333%)` (colonne pari al contrario), durate
  46/58/52/64 s, `padding-bottom` uguale al gap così il loop è esatto. Gap 12px, poster 112×168.
  Prop `posters: string[]` (16 poster_path), `blur`, `opacity`, `height`. Rispetta
  `prefers-reduced-motion`. Sopra: gradiente nero e alone viola (vedi `Main.dc.html`).
  Dati: `getTrending()` (trending/all/week, IT), i primi 16 con poster, cache 24h via `fetch`
  revalidate; fallback alle ultime 16 righe di `titles` per `fetched_at`. Helper server-only
  `getWallPosters()` in `src/lib/tmdb/wall.ts`.
- **`FloatingNav`** sostituisce la barra piena di `BottomNav` su mobile: pillola 358×64 a
  16px dai bordi, 22px dal fondo (+ safe area), `rgba(28,28,30,0.72)` + blur 24, ombra
  `0 20px 50px rgba(0,0,0,.6)`, tab attiva con sfondo `accent/22` e testo `accent-pale`.
  Sotto la nav un gradiente nero di 140px (`pointer-events: none`). Desktop resta sidebar.
  Le pagine passano da `pb-28` a `pb-36`.
- **`TopBar`**: titolo 34px/700, senza sfondo sticky opaco (solo `bg-bg/80 backdrop-blur`
  quando scrolla); azione destra come cerchio in vetro 40px.
- **`Button`**: `primary` = pillola viola h-54 con ombra `0 8px 28px rgba(139,92,246,.35)`;
  `secondary` = pillola vetro; `danger` nuovo.
- **`Card`** = `z-card` (20px, surface, border). `Sheet`: sfondo `#0a0a0c`, raggio 32, maniglia
  36×5, backdrop `bg-black/60 backdrop-blur-sm`.
- **Input**: h-54, raggio 14, `bg-surface-2`, testo 16px, focus `border-accent` +
  `ring-4 ring-accent/15`.
- **`PosterCard`**: raggio 14, badge provider 20px con bordo nero, voto `★ n` in `accent-soft`.
- **`Avatar`**: gradiente viola su iniziale quando manca la foto.

## Pagine

Riferimento esatto per ogni pagina è il file `.dc.html` corrispondente.

### Auth (`Main`, `Signup`, `CheckEmail`)
`(auth)/layout.tsx` diventa: `PosterWall` in alto (h 560, nitido), wordmark 56px "Zapp." con
punto viola e tagline a y≈318, form in bottom sheet fisso (`#0a0a0c`, raggio 32 in alto,
maniglia). Login: Email, Password, CTA "Accedi", divisore "oppure", Google bianco, "Registrati".
Signup: titolo "Crea il tuo account.", hint "Almeno 8 caratteri.", CTA "Crea account".
Controlla email: muro blur 6px opacità .55, icona busta in riquadro viola, riga con l'email e
stato "Inviata". Il layout auth deve accettare un titolo per pagina (login: wordmark; signup:
"Crea il tuo account."; check-email: "Controlla la tua email.").

### Onboarding (`Onboarding`)
Muro blur 10px opacità .45. Blocco foto profilo: avatar 92px con badge fotocamera, "Foto
profilo", "Tocca per scegliere una foto. Puoi farlo anche dopo.", link "Cambia foto" (riusa
l'upload avatar di `ProfileEditor`, estratto in `src/components/profile/AvatarPicker.tsx`).
Titolo "Scegli il tuo username.", campo con prefisso `@`, hint, nome visualizzato con
"opzionale" a destra, CTA "Inizia a usare Zapp".

### Home (`Home`, `HomeFull`)
Niente TopBar. Hero 420px: backdrop della prima voce `watching` (w780), gradiente, alone viola;
label "Continua a guardare" in `accent-soft`, titolo 40px, chip vetro con logo provider e nome,
"Stagione n, episodio m", barra progresso 4px, CTA pillola "Continua" (flex-1) + "+1 ep" vetro
(solo serie). Se non c'è nulla in corso: hero con muro poster e stato vuoto attuale.
Sezioni: "In corso" (le altre voci watching: poster 112 con logo e barra 3px, nome, SnEm),
"Consigliati da amici" (card con poster 48×72, avatar amico, messaggio, pillola "Voglio vederlo"
in viola tenue), "Da vedere", "Visti di recente" (voto `★ n` in accent-soft, "Senza voto").
Titoli sezione 20px/700 con "Vedi tutti" in accent-soft.

### Cerca (`Search`, `SearchResults`)
Titolo "Cerca" 34px, campo pillola vetro h-52 con icona lente. Discover: "Di tendenza questa
settimana", "Nuovi su streaming" (con logo provider), chip "Per genere" (h-36, surface-2).
Con testo: campo con bordo viola + ring, X per svuotare, "Annulla" a destra, contatore
"n risultati", griglia 3 colonne gap 16, anno e badge provider.

### Amici (`Friends`, `FriendsEmpty`)
Titolo "Amici" + campanella vetro con punto viola (link a `/notifications`). Ricerca utenti
pillola h-48. "Richieste ricevute" con badge conteggio viola, riga con Accetta (pillola viola) e X
(cerchio vetro). "I tuoi amici" come fila orizzontale di avatar 56px con nome sotto (link a
`/u/[username]`). "Attività degli amici": card con avatar 38, testo con nome e titolo in
grassetto, voto in accent-soft, locandina 40×60 a destra, orario sotto. Vuoto: avatar impilati,
titolo, testo, link invito copiabile (icona copia), CTA "Invita un amico" (Web Share API con
fallback copia).

### Libreria (`Library`, `LibrarySheet`)
Titolo "Libreria" con selettore Tutti/Film/Serie a segmenti (pillola vetro, segmento attivo
`white/14`) a destra. Tab stato a pillola h-38 (attiva viola con ombra). Contatore "n titoli".
Griglia 3 colonne, tasto "…" 28px vetro in alto a destra della locandina, voto `★ n` + anno.
Sheet azioni: testata con locandina 48×72, titolo, "Serie, anno. In Visti con ★ n"; gruppo
azioni con icona (Voglio vederlo, Sto guardando, Visto, Abbandona) e gruppo separato
"Rimuovi dalla libreria" in danger.

### Profilo (`Profile`, `ProfileFull`)
Niente TopBar. `PosterWall` con le locandine dell'utente (watched, max 16; se meno di 8 usa
trending), opacità .75, lentissimo (90–110 s). "Modifica" pillola vetro a sinistra e ingranaggio
vetro a destra (per ora apre lo stesso sheet Modifica profilo). Avatar 124px con anello
conic-gradient viola e badge fotocamera, nome 34px/800, @username, avatar amici impilati +
"n amici". Statistica hero: ore in 76px/800 + "ore di film e serie"; a fianco, separati da
hairline, Film visti / Serie viste / Episodi. "Generi più visti" come barra proporzionale h-14
(gap 3) con legenda (punto colorato, nome, %) e "su n titoli"; colori per genere in
`GENRE_COLORS` (`src/lib/config.ts`, mappa id TMDB → hex: Dramma `#3b82f6`, Fantascienza
`#22d3ee`, Thriller `#ef4444`, Commedia `#facc15`, Crime `#f97316`, Azione `#f43f5e`,
Avventura `#10b981`, Animazione `#f472b6`, Fantasy `#8b5cf6`, Horror `#7f1d1d`, Mistero
`#6366f1`, Romance `#fb7185`, Documentario `#a3a3a3`, Famiglia `#fbbf24`, Storia `#a16207`,
Musica `#d946ef`, Guerra `#78716c`, Western `#b45309`, TV `#64748b`; Sci-Fi & Fantasy e
gli altri generi TV mappati sui corrispondenti). "I tuoi voti più alti": card 150×225 con
gradiente e voto 30px/800 in accent-pale. Gruppo impostazioni unico (Profilo privato con toggle
iOS, Importa da Netflix con riquadro N rosso, Esci in danger). Footer TMDB invariato.

### Titolo (`Title`, `TitleFull`)
Backdrop 440px con gradiente; indietro e condividi (Web Share) in vetro. Locandina 110×165 con
ombra + titolo 38px/800, meta "anno, n stagioni, n episodi", chip generi vetro. Card progresso
(solo serie in `watching`): "Sei a" + "S2 E4" 24px/800, "n episodi rimasti", barra 6px con
gradiente, "Prossimo: SnEm", link "Segna progresso" (apre i controlli attuali). "Dove guardarlo":
card con logo 44px, nome, "Incluso nell'abbonamento" / "A noleggio o acquisto", CTA "Apri"
viola con icona play; "Altre opzioni" resta come `details`. "Guardato da" con avatar impilati.
Voto TMDB `8,2 / 10, n voti` + "Trailer" pillola vetro. Trama, Cast (72px tondi, nome,
personaggio), Stagioni (righe con locandina 44×66, stato: spunta viola se completata, "4 / 10"
in corso, chevron), Recensioni (voto Zapp, prompt "Cosa ne pensi?" con 5 stelle, card
recensione). Barra azioni fissa: azione principale pillola viola (flex-1) + cerchi vetro 56px
"Vota" e "…"; etichette delle azioni come oggi in `TitleActionsBar`.

### Stagione (`Season`)
Testata con locandina stagione blur 24px, indietro, link serie, "Stagione n" 26px, "n episodi,
anno", barra e "k / n". Episodi: card con still 118×66, numero + nome, "min, data"; visti a
opacità .55 con spunta su still; prossimo con bordo viola + ring e badge "Prossimo".

### Notifiche (`Notifications`)
Indietro + "Notifiche". Gruppi "Nuove" (label accent-soft) e "Precedenti". Card con avatar 40
e icona tipo in cerchietto, testo con nome/titolo in grassetto, orario relativo, locandina 34×51
o punto viola. Vuoto: EmptyState attuale.

### Importa Netflix (`ImportNetflix`, `ImportReview`)
Intro: riquadro N rosso + frase, card "Come scaricare il tuo storico" con 3 passi numerati,
zona drop tratteggiata viola, CTA "Scegli il file CSV", nota TMDB. Revisione: "38" 44px/800 +
"titoli riconosciuti su 45", righe con checkbox 24px (viola se inclusa), locandina 36×54,
titolo, "Serie, fino a SnEm" / "Film"; "Non riconosciuti (n)" con pillola vetro "Cerca a mano";
CTA fissa "Importa n titoli". Risultato finale: come oggi.

### Profilo pubblico (`PublicProfile`)
Backdrop = locandina in corso sfocata; indietro e "…" (blocca) in vetro; avatar 104 centrato,
nome 30px/800, @username; stato amicizia come pillola (Amici ✓ viola tenue / Aggiungi viola /
Richiesta inviata vetro / Accetta) + "Consiglia" vetro (apre `RecommendSheet`); contatori
"n visti, n in corso, n amici"; shelf "Sto guardando" e "Visti di recente". Privato: card
"Profilo privato" come oggi ma in `z-card`.

## Vincoli

- Nessuna libreria UI esterna; icone inline SVG stroke 1.8, griglia 24.
- Niente chiamate TMDB dal client. `PosterWall` riceve i path dal server.
- `image.tmdb.org` già in CSP e nel service worker.
- `prefers-reduced-motion`: muro fermo, nessuna animazione d'ingresso.
- Desktop (`lg+`): layout a colonne attuale invariato; la nav resta sidebar.
- Verifica: `pnpm typecheck && pnpm lint && pnpm build`, più controllo visivo in browser
  a 390px su login, home, profilo, titolo.
