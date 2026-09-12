# ZAPP — FASE 3: TRACKING DELLE VISIONI

## Contesto
Fasi 1 e 2 completate: auth, schema, catalogo con scheda titolo, "Dove guardarlo" con link diretti, discover. Leggi README, `supabase/migrations`, `components/title/` e i placeholder `<TitleActions />` ed `<EpisodeActions />` prima di iniziare.

Questa è la fase che decide se l'app viene usata. Le app di tracking muoiono perché aggiornare lo stato costa fatica: ogni azione principale deve richiedere **un solo tap** dalla schermata in cui l'utente si trova, senza form, senza conferme, con undo.

Si costruiscono: azioni sui titoli, home "Sto guardando" con ripresa via link diretto, liste, progresso serie (stagione/episodio corrente, nessuna checklist per episodio), profilo con statistiche, import dello storico Netflix da CSV. Nessun social: le colonne `is_private` esistono già ma non hanno ancora effetto visibile.

## Modello
Usa `watch_entries` così com'è. Stati: `want`, `watching`, `watched`, `dropped`. Per le serie `season_number` ed `episode_number` indicano l'ultimo episodio visto. `episode_watches` in questa fase **non si usa** (resta per il futuro).

Transizioni automatiche:
- `want → watching` quando l'utente tocca "Inizia"
- `watching → watched` quando segna l'ultimo episodio dell'ultima stagione disponibile, o tocca "Finito"
- `started_at` alla prima entrata in `watching`, `finished_at` a `watched`
- Il voto (1–10) è opzionale e indipendente dallo stato

## Azioni sui titoli (`<TitleActions />`)
Sostituisci il placeholder nella scheda titolo. Barra fissa in fondo allo schermo (sopra la bottom nav) con al massimo due bottoni primari, a seconda dello stato:

| stato attuale | bottone primario | secondario |
|---|---|---|
| nessuno | **Voglio vederlo** | Inizia |
| want | **Inizia** | Rimuovi |
| watching (film) | **Continua su {provider}** | Finito |
| watching (serie) | **Continua su {provider}** | Prossimo episodio (S2E5 → S2E6) |
| watched | **Vota** (se non votato) | Rivedi |
| dropped | Riprendi | Rimuovi |

"Continua su {provider}" usa il primo provider `flatrate` del titolo e il link diretto della Fase 2. Se ce n'è più di uno, il tap principale apre il primo e un long press (o chevron) apre un bottom sheet con tutti. Se non c'è nessun provider, il bottone diventa "Segna progresso".

Ogni azione è una Server Action ottimistica (`useOptimistic`): l'UI cambia subito, toast con "Annulla" per 5 secondi. Nessun dialog di conferma, mai.

Menu "altro" (icona a tre puntini) con: cambia stato, vota, segna privato, rimuovi.

## Progresso serie
- Nella scheda serie, sotto l'header: riga "Sei a S2E5 · 18 episodi rimasti" con bottone "+1 episodio"
- Nella pagina stagione, ogni `EpisodeRow` ha un tap che imposta quell'episodio come ultimo visto (sostituisce `<EpisodeActions />`); gli episodi fino a quello si mostrano attenuati con spunta, quelli dopo normali. È una posizione, non una checklist: toccare S1E3 e poi S1E1 riporta indietro il progresso
- Bottom sheet "Imposta progresso" con due picker (stagione, episodio) per chi vuole saltare
- Calcolo episodi rimasti da `titles.raw.seasons` escludendo la stagione 0 (speciali) e gli episodi con `air_date` futura

## Home "Sto guardando"
Sostituisce l'`EmptyState` della Fase 1.
1. **Continua a guardare**: griglia di card dei titoli `watching`, ordinate per `updated_at desc`. Ogni card: poster, titolo, per le serie "S2E5" e barra di avanzamento sottile, logo del provider. Tap sulla card → scheda titolo. Bottone piccolo "Continua" sulla card → apre direttamente il link diretto senza passare dalla scheda. Per le serie, secondo bottone "+1"
2. **Da vedere**: scroll orizzontale dei `want`, ordinati per `created_at desc`, con badge dei provider su cui sono disponibili adesso (così l'utente vede subito cosa può iniziare)
3. **Visti di recente**: ultimi 10 `watched`, con voto se presente
4. Se tutte e tre sono vuote: `EmptyState` con CTA "Cerca un titolo" e "Importa da Netflix"

La home è una Server Component che legge con una sola query per sezione (join con `titles` e `title_providers`), nessuna chiamata TMDB nel render.

## Liste
Route `/library` (nuova tab al posto di "Amici" nella bottom nav; Amici torna in Fase 4 come quinta tab o dentro Profilo — scegli tu e motiva) con segmented control: Sto guardando · Da vedere · Visti · Abbandonati. Griglia di poster, ordinamento per data, filtro film/serie. Long press su una card apre il bottom sheet delle azioni.

## Profilo
`/profile` mostra: avatar, username, contatori (film visti, serie viste, episodi visti stimati da `season_number`/`episode_number`, ore stimate da `runtime`), generi più visti (dai `genres` dei titoli `watched`), i 5 titoli con voto più alto. Modifica username/display name/avatar (upload su Supabase Storage bucket `avatars`, max 2MB, ridimensionato lato client a 512px). Toggle "Profilo privato" (salva `is_private`, effetto in Fase 4). Attribuzione TMDB nel footer.

## Import Netflix
Route `/import/netflix`. L'utente carica `NetflixViewingHistory.csv` (scaricato da Account → Profilo → Attività di visione → "Scarica tutto"). Formato: due colonne `Title,Date`, date in formato `M/D/YY` o localizzato; le serie compaiono come `"Titolo: Stagione 1: Nome episodio"` con varianti ("Season 1", "Stagione 1", "Parte 1", "Limited Series", "Capitolo N").

Flusso:
1. Parsing lato server (Server Action, file max 5MB, `papaparse`). Raggruppa le righe: per le serie estrai titolo, stagione, episodio ordinale (posizione dell'episodio tra quelli della stessa stagione nel CSV, non il nome); per i film la riga singola
2. Matching su TMDB con `searchMulti` per ogni titolo unico, in batch di 10 con `Promise.all` e pausa tra i batch per il rate limit. Punteggio di match: uguaglianza normalizzata del titolo (lowercase, senza punteggiatura e articoli) e anno vicino se presente. Sotto soglia → "non trovato"
3. Pagina di revisione **prima** di scrivere qualsiasi cosa: lista dei titoli riconosciuti con poster e stato proposto (serie → `watching` con l'ultimo episodio visto, oppure `watched` se ha visto l'ultimo episodio dell'ultima stagione; film → `watched` con `finished_at` = data Netflix), i non riconosciuti con un campo di ricerca manuale, checkbox per escludere. Mostra il numero totale prima del bottone "Importa N titoli"
4. Scrittura: upsert in `watch_entries` che **non sovrascrive** entrate esistenti con progresso più avanzato o già votate
5. Riepilogo finale con link alla libreria

Il CSV non va salvato: elaborato in memoria e scartato. Registra solo `imports(user_id, source, rows, matched, created_at)` in una nuova tabella per le statistiche: è l'unica aggiunta allo schema di questa fase, migration `0002`.

## Criteri di accettazione
1. Da scheda titolo senza stato: un tap su "Voglio vederlo" → compare in home "Da vedere" senza ricaricare; toast con Annulla funzionante
2. Serie in `watching`: "+1" dalla home aggiorna S2E5 → S2E6 e la barra; all'ultimo episodio disponibile lo stato passa a `watched` da solo
3. Tap su un episodio nella pagina stagione imposta la posizione; tap su uno precedente la riporta indietro
4. "Continua su Netflix" dalla card in home apre il link diretto senza passare dalla scheda
5. Import di un CSV Netflix reale con 300+ righe: revisione in < 15s, almeno il 90% dei titoli mainstream riconosciuti, nessuna scrittura prima della conferma, entrate esistenti non degradate
6. Profilo: contatori coerenti con la libreria; upload avatar funziona
7. Nessuna chiamata TMDB nel render della home (verifica dai log)
8. `pnpm typecheck` e `pnpm lint` puliti; RLS impedisce a un utente di leggere le `watch_entries` di un altro (testalo con due account)

## Cosa NON fare
- Nessuna checklist per episodio, nessuna scrittura in `episode_watches`
- Nessun social, feed, amici, recensioni testuali (il voto numerico sì)
- Nessun dialog di conferma sulle azioni; l'undo è il toast
- Non salvare il CSV, non loggare i titoli importati
- Non chiedere all'utente credenziali Netflix o di altre piattaforme, mai

Procedi per step con commit atomici. Se una transizione di stato ti sembra ambigua, proponi la regola e fermati.
