# Liste condivise, link-consiglio, commenti e Play diretto

Quattro cose nate insieme e finite il 2026-09-12: una raccolta di titoli che si
puo' condividere con gli amici, un link che porta un consiglio dentro Zapp, i
commenti sotto un titolo o un episodio, e il bottone che apre la piattaforma
**sull'episodio giusto** invece che sulla sua scheda.

## Liste (`title_lists`, `title_list_members`, `title_list_items`)

Migration `0040_shared_lists.sql`. `src/lib/lists/` (`actions.ts`, `queries.ts`,
piu' `link.ts` e `members.ts`, puri con Vitest), UI in `src/components/lists/`,
pagine `/lists` e `/lists/[id]`, ingresso dalla Libreria.

- **Tre ruoli**: `owner`, `editor`, `viewer`. `default_role` decide cosa prendono
  i nuovi invitati. Chi e' `viewer` legge; chi e' `editor` aggiunge e toglie
  titoli; solo il proprietario invita, cambia i ruoli, rinomina e cancella.
- **Le policy chiamano tre funzioni** (`is_title_list_member`,
  `is_title_list_owner`, `can_edit_title_list`), SECURITY DEFINER con
  `search_path = ''` e `(select auth.uid())` dentro: le policy le devono poter
  chiamare, come `are_friends`. Girano **per riga**, ma le righe qui sono le
  liste di una persona, non un feed: la regola della fase scala vale dove i
  numeri crescono.
- **Una policy senza un'azione che la usi non esiste.** `title_lists_update_owner`
  e `title_lists_delete_owner` erano nella migration dal primo giorno e nessuna
  Server Action le chiamava: una lista nata con il nome sbagliato restava cosi'
  per sempre. Oggi ci sono `updateList` e `deleteList` e il foglio
  `ListSettingsSheet` (solo per il proprietario). Stessa cosa era successa ai
  commenti con la loro `delete`. **Quando aggiungi una policy, aggiungi anche
  chi la usa, o non aggiungerla.**
- Il controllo di proprieta' si ripete **anche nel codice** (`.eq("owner_id", …)`),
  non solo nella RLS: senza, un tentativo non autorizzato torna "zero righe"
  invece di un errore.

## Link-consiglio (`recommendation_links`)

Stessa migration. Serve a mandare un titolo a un amico con un link, invece che
dalla sola lista dei consigli dentro l'app.

- Il link porta un **token**; nel database c'e' solo il suo `sha256`
  (`token_hash`), come per i dispositivi di ZConnection. Scade, e si consuma una
  volta sola (`consumed_at`).
- `consume_recommendation_link` e `preview_recommendation_link` sono SECURITY
  DEFINER: il destinatario deve poter leggere **quel** link senza avere una
  lettura libera della tabella. Tutte e due pretendono che chi apre sia gia'
  **amico** del mittente: un link inoltrato a un estraneo non apre niente.
- `/share/recommendation/[token]` e' in `PUBLIC_PATHS` (il destinatario puo'
  arrivare sloggato) e manda a `/login?next=…`; il `next` passa da
  `safeNextPath`. **La base del redirect e' `NEXT_PUBLIC_APP_URL`**
  (`src/lib/app-origin.ts`), mai `request.url`: quella origine nasce dall'header
  `Host`, che lo scrive chi chiama. La stessa funzione la usa `/auth/callback`,
  che aveva la regola scritta e una copia locale della funzione.

## Commenti sui titoli (`title_comments`)

Migration `0041_title_comments.sql` + `0042_title_comments_moderation.sql`.
`TitleComments` sta sotto le recensioni della scheda titolo e dentro ogni riga
episodio della pagina stagione. Il corpo puo' contenere una GIF, un meme o uno
sticker del catalogo KLIPY (`src/lib/comments/`, `src/components/comments/`).

- **Il media sta nel corpo del commento**, in un formato versionato
  (`[zapp-media:1]{…}`, `content.ts`): niente colonna nuova, niente tabella
  nuova, e i commenti scritti prima restano leggibili. `encodeComment` riscrive
  il payload **campo per campo**: nessuna proprieta' arbitraria del client
  sopravvive.
- **La miniatura non e' l'immagine.** La griglia del selettore mostra
  ventiquattro elementi alla volta: `parseKlipyPage` porta anche `thumbnailUrl`
  (la resa piu' piccola) e la griglia usa quella, mentre nel commento va sempre
  l'originale. `thumbnailUrl` non finisce nel corpo salvato.
- **KLIPY e' l'unica terza parte nella CSP oltre a TMDB e YouTube**:
  `api.klipy.com` in `connect-src`, i quattro host `static*.klipy.c*` in
  `img-src` e `connect-src` (`next.config.ts`). Le immagini si caricano dirette,
  senza ottimizzatore e senza copiarle nel nostro storage.
- **Moderazione come le recensioni** (0042): `report_count` tenuto da un trigger
  su `reports` (`target_type = 'title_comment'`), e la soglia sta **nella
  policy**, non in un filtro della query — a tre segnalazioni distinte il
  commento sparisce a tutti tranne al suo autore. Prima non c'era modo di
  segnalare niente.
- **`my_blocked_ids()` invece di `is_blocked` per riga.** La policy di lettura
  chiamava una funzione SECURITY DEFINER per **ogni riga esaminata**, che e'
  l'errore misurato nella fase scala (il feed passo' da 1.239 ms a 0,8 ms
  togliendolo) — e la pagina di una stagione legge fino a 200 commenti insieme.
  Ora l'elenco dei bloccati si calcola una volta sola, come `my_friend_ids()`.
- **Nessun grant di UPDATE**: un commento non si modifica, si cancella e si
  riscrive; `report_count` lo tocca solo il trigger.
- Lo **spoiler** e' una dichiarazione di chi scrive: la colonna e il velo
  "Spoiler — mostra" c'erano dal primo giorno, ma nessuno poteva accendere
  l'interruttore e ogni commento partiva senza.

## Play diretto (`/play/[mediaType]/[id]/[providerId]`)

`src/lib/links/playback*.ts` (le parti pure hanno i loro Vitest), rotta
`src/app/play/…`, usato da `PlaybackLink` nella tessera "Continua a guardare".

- **L'episodio e' quello mostrato nella tessera**, passato in query: non si
  ricalcola "il prossimo" al clic, altrimenti un battito di ZConnection arrivato
  nel frattempo cambierebbe destinazione sotto il dito.
- Solo i quattro provider con un player conosciuto (8, 39, 119, 337) e solo
  link di player **provati**: mai trasformare l'id di una serie nell'id di un
  episodio. Quando non si sa, si torna al link della scheda.
- Rotta autenticata (404 a chi non ha sessione) e con rate limit proprio: dietro
  c'e' una risoluzione che puo' chiamare TMDB e JustWatch.
