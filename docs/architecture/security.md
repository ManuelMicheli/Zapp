# Sicurezza (audit 2026-09-07)

Regole non negoziabili, nate da un audit che ha trovato due falle critiche
(migrations `0020_security_hardening.sql`, `0021_review_moderation_rls.sql`).

- **Il ruolo `anon` non ha niente nello schema `public`.** La chiave anon sta nel
  bundle del browser: finche' le policy erano `to public`, chiunque poteva
  scaricare da PostgREST tutti i profili non privati, tutte le recensioni e tutti
  i commenti senza avere un account. Ora ogni grant per `anon` e' revocato
  (tabelle, viste, sequenze, funzioni, piu' le default privileges) e ogni policy
  e' scritta `to authenticated`. **L'app non legge mai dal DB da sloggata**:
  login e signup usano solo le API auth, il muro di locandine passa dal service
  client. Chi aggiunge una lettura su una pagina pubblica deve usare il service
  client, non riaprire `anon`.
- **Ogni policy di UPDATE ha un `with check` che ripete la condizione di
  proprieta'**, e dove il `with check` non basta perche' servirebbe la riga
  vecchia, c'e' un trigger. `friendships_update_addressee` controllava solo lo
  `status`: chi riceveva una richiesta poteva riscrivere `requester_id` e
  `addressee_id` con due id qualsiasi e metterla ad `accepted`, cioe' diventare
  "amico" di chiunque e leggergli libreria, attivita' e profilo privato. Oggi
  `friendships_parties_immutable` blocca il cambio delle parti e la policy vale
  solo su righe `pending` (prima chi veniva bloccato poteva sbloccarsi da solo
  aggiornando la riga `blocked` di cui era destinatario).
- **Grant per colonna dove l'utente deve toccarne solo alcune**: `profiles`
  (nome, avatar, privacy, fine onboarding), `recommendations` (solo `seen_at`),
  `reviews` (mai `report_count`). Attenzione: l'upsert di PostgREST genera un
  `ON CONFLICT DO UPDATE` su **tutte** le colonne del payload, quindi il grant di
  UPDATE deve coprirle tutte, non solo quelle che "cambiano".
- **Le regole di visibilita' stanno nella RLS, non nel filtro della query.** La
  moderazione delle recensioni era solo un `.lt("report_count", 3)` nel client:
  bastava interrogare la tabella senza quel filtro. Ora `report_count` e' una
  colonna tenuta dal trigger `sync_review_report_count` ed entra nella policy;
  `reviews_with_counts` e' tornata `security_invoker`. `user_search` resta
  SECURITY DEFINER apposta (serve a trovare per username anche un profilo
  privato, per invitarlo): l'avviso dell'advisor su quella vista e' accettato.
- **`are_friends`/`is_blocked` rispondono solo su se stessi.** Sono RPC esposte a
  chi ha fatto accesso (servono dentro le policy): senza vincolo, mappando
  username -> id con `user_search` si ricostruiva il grafo delle amicizie altrui.
  Dentro la sessione di un utente una delle due parti dev'essere lui; nei trigger
  e nei job (`auth.uid()` nullo) il comportamento non cambia.
- **Le funzioni di trigger vanno revocate** da `anon`, `authenticated` e `public`,
  altrimenti Supabase le espone come `/rest/v1/rpc/<nome>` e sono SECURITY DEFINER.
- **Ogni Server Action e' un endpoint HTTP.** Gli argomenti li scrive chiunque
  abbia una sessione, non il nostro componente: si validano con
  `src/lib/validate.ts` (`isUuid`, `isTmdbId`, `isMediaType`, `isIntInRange`,
  `escapeLike`, `isSafeExternalUrl`, `safeNextPath`; puro, test in
  `validate.test.ts`). Anche lo snapshot dell'undo di `watch/actions.ts` fa il
  giro dal client, quindi torna come dato non fidato e si riscrive campo per campo.
- **Mai costruire un filtro PostgREST concatenando stringhe.** Dentro `.or()` il
  valore fa parte della grammatica dei filtri: `removeFriend`/`blockUser`
  interpolavano l'id dell'altro utente e un id con virgole o parentesi riscriveva
  la condizione. Si usano `.eq()` separati (`deleteFriendshipBothWays`). In
  `.ilike()` si passa da `escapeLike`: `%`, `_` e `*` sono jolly e trasformavano
  la ricerca per prefisso in una ricerca "contiene".
- **Il controllo di proprieta' si fa anche nel codice, non solo nella RLS.**
  `cancelPlan` non aveva ne' sessione ne' `.eq("user_id", …)`: cancellava serata e
  biglietto contando unicamente sulle policy.
- **Verso il client va sempre un messaggio generico.** `error.message` di
  PostgREST racconta colonne, vincoli e policy; il dettaglio resta nei log.
- **Ogni azione che costa (TMDB, Nominatim, scritture sociali) ha un rate limit**
  dichiarato al punto di chiamata (`src/lib/rate-limit.ts`). Il limitatore in
  memoria si ripulisce da solo e, se Upstash e' giu', si scende su di lui invece
  di lasciar passare tutto.
- **URL esterni**: solo https verso un dominio pubblico (`isSafeExternalUrl`),
  controllati sia quando si salvano (`booking_url`) sia prima del redirect
  (`/go/...`, dove il link `justwatch` arriva da terzi). Non si fissa il dominio
  della piattaforma: l'offerta Prime Video sta legittimamente su `amazon.it`.
  Il `next` di `/auth/callback` passa da `safeNextPath` e la base del redirect e'
  `NEXT_PUBLIC_APP_URL`, non l'`origin` ricavato dall'header `Host`.
- **Header** in `next.config.ts`: CSP (con `object-src 'none'`, `worker-src`,
  `frame-ancestors 'none'`, `upgrade-insecure-requests`), HSTS 2 anni,
  COOP/CORP `same-origin`, `X-Frame-Options: DENY`, nosniff, Permissions-Policy a
  lista chiusa. **`autoplay`, `fullscreen` ed `encrypted-media` nominano
  esplicitamente `https://www.youtube-nocookie.com`**: senza, la policy toglie
  quelle funzioni proprio al player del trailer.
  `script-src` tiene `'unsafe-inline'` **di proposito**: il nonce per richiesta
  obbligherebbe ogni pagina a rendersi dinamicamente e farebbe cadere il
  rendering statico su cui poggiano prefetch e aperture istantanee. Il rischio
  che coprirebbe e' basso: nessun `dangerouslySetInnerHTML`, nessun HTML scritto
  dagli utenti, nessun `eval`.
- **Verifica**: `node scripts/security-check.mjs` contro un'istanza avviata
  (header, rotte protette, open redirect, rendering e violazioni CSP con
  Playwright). Da rilanciare a ogni modifica di CSP, header o middleware.
  Lato DB: `get_advisors` di Supabase dopo ogni migration.
- **Cosa resta noto e accettato**: il cookie di sessione non e' `httpOnly` (lo
  legge `createBrowserClient` di `@supabase/ssr`, e' la sua architettura), quindi
  la difesa dall'XSS e' la CSP piu' l'assenza di sink HTML; `cinema_films`,
  `cinema_links`, `cinema_venues` e `job_runs` hanno RLS senza policy, cioe'
  chiusi a tutti tranne al service client, ed e' voluto. `my_friend_ids()` e'
  esposta come RPC a chi ha fatto accesso perche' le policy la devono poter
  chiamare (stessa ragione di `are_friends`): non ha argomenti, quindi risponde
  solo sull'utente della sessione e non dice niente che non sia gia' sulla
  pagina Amici.

