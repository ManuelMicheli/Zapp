-- Indici che mancano quando gli utenti diventano tanti.
--
-- Chiavi esterne senza indice: ogni lettura per quella colonna e' una scansione
-- completa. Oggi non si vede perche' le tabelle hanno decine di righe.

-- La home legge i consigli ricevuti e non ancora visti: era un bitmap scan su
-- tutta la tabella (7 ms gia' col banco di prova, e cresce con i consigli di
-- tutti, non con i propri).
create index if not exists recommendations_to_user_idx
  on public.recommendations (to_user, seen_at);
create index if not exists recommendations_title_idx
  on public.recommendations (title_id, media_type);

-- La join che regge home e libreria: watch_entries -> titles.
create index if not exists watch_entries_title_idx
  on public.watch_entries (title_id, media_type);

create index if not exists activity_likes_user_idx
  on public.activity_likes (user_id);
create index if not exists review_likes_user_idx
  on public.review_likes (user_id);
create index if not exists review_comments_user_idx
  on public.review_comments (user_id);
create index if not exists review_comments_parent_idx
  on public.review_comments (parent_id);
create index if not exists reports_reporter_idx
  on public.reports (reporter_id);
create index if not exists imports_user_idx
  on public.imports (user_id, created_at desc);

-- Il feed legge le attivita' recenti di tutti gli amici: senza un indice sul
-- tempo l'ordinamento parte da una scansione completa. Misurato col banco:
-- 1.303 ms per quaranta righe.
create index if not exists activities_recenti_idx
  on public.activities (created_at desc);

create index if not exists user_seed_picks_user_idx
  on public.user_seed_picks (user_id, created_at desc);

-- Qui c'era `watch_entries (user_id, updated_at desc)` per taste_refresh_queue,
-- che chiede max(updated_at) per ogni profilo. **Tolto dopo averlo misurato.**
-- Avendo la stessa colonna di testa di watch_entries_user_status_last_watched_idx,
-- il pianificatore lo preferiva per la query della libreria, e li' e' l'indice
-- sbagliato: perde `status` come condizione e costringe a un ordinamento. Col
-- banco, la libreria passava da 10,1 a 12,6 ms di esecuzione. La coda dei gusti
-- gira una volta all'ora e si accontenta dell'indice che c'e' gia'; la libreria
-- e' la query piu' battuta dell'app. Se un giorno la coda diventasse un problema,
-- la strada e' cambiare la funzione, non rimettere questo indice.

-- Le due tabelle che crescono per utente. Con la soglia di serie (20%) il vacuum
-- su mezzo milione di righe parte dopo centomila righe morte, e fino ad allora le
-- statistiche invecchiano e i piani peggiorano.
alter table public.watch_entries set (autovacuum_vacuum_scale_factor = 0.02,
                                      autovacuum_analyze_scale_factor = 0.01);
alter table public.user_events set (autovacuum_vacuum_scale_factor = 0.02,
                                    autovacuum_analyze_scale_factor = 0.01);

-- Nota: l'advisor segnala come inutilizzati title_provider_links_resolved_at_idx,
-- cinema_films_movieglu_idx e title_charts_title_idx. **Restano.** Stanno su
-- tabelle da 757, 40 e 80 righe: quello che costano in scrittura non e'
-- misurabile, e title_charts_title_idx e' il modo in cui si trovera' un titolo
-- in classifica quando le classifiche saranno grandi. Togliere un indice per
-- far tacere un avviso su una tabella da quaranta righe non e' una
-- ottimizzazione.
