-- Sicurezza: chiusura di due falle critiche e irrigidimento generale.
--
-- 1. Amicizie forgiabili (CRITICO). `friendships_update_addressee` controllava
--    in WITH CHECK solo lo `status`: chi riceveva una richiesta poteva riscrivere
--    `requester_id`/`addressee_id` con due id qualsiasi e metterla ad `accepted`,
--    diventando "amico" di chiunque -> lettura di watch_entries, activities e
--    profilo privato della vittima. E chi veniva bloccato, essendo addressee
--    della riga `blocked`, poteva rimetterla ad `accepted` e sbloccarsi da solo.
-- 2. Dati leggibili senza login (CRITICO). Tutte le policy erano `to public`,
--    cioe' anche per il ruolo `anon`, e la chiave anon sta nel bundle del browser:
--    `profiles` (tutti i profili non privati), `reviews`, `review_comments` e
--    `review_likes` (USING true) erano scaricabili da chiunque via PostgREST,
--    senza account. L'app non legge mai dal DB da sloggata (login/signup usano
--    solo le API auth, il muro di locandine passa dal service client), quindi ad
--    `anon` serve zero nello schema public.

-- ============================================================
-- 1. Le parti di un'amicizia non si possono cambiare
-- ============================================================

create or replace function public.friendships_parties_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.requester_id is distinct from old.requester_id
     or new.addressee_id is distinct from old.addressee_id then
    raise exception 'Le parti di una amicizia non si possono cambiare';
  end if;
  return new;
end;
$fn$;

drop trigger if exists friendships_parties_immutable on public.friendships;
create trigger friendships_parties_immutable
  before update on public.friendships
  for each row execute function public.friendships_parties_immutable();

-- Si aggiorna solo una richiesta ancora `pending` di cui si e' destinatari:
-- una riga `blocked` non torna piu' indietro da sola.
drop policy if exists friendships_update_addressee on public.friendships;
create policy friendships_update_addressee on public.friendships
  for update to authenticated
  using (addressee_id = auth.uid() and status = 'pending')
  with check (
    addressee_id = auth.uid()
    and status = any (array['accepted'::friendship_status, 'blocked'::friendship_status])
  );

drop policy if exists friendships_select_involved on public.friendships;
create policy friendships_select_involved on public.friendships
  for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists friendships_delete_involved on public.friendships;
create policy friendships_delete_involved on public.friendships
  for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists friendships_insert_own on public.friendships;
create policy friendships_insert_own on public.friendships
  for insert to authenticated
  with check (
    requester_id = auth.uid()
    and status = any (array['pending'::friendship_status, 'blocked'::friendship_status])
    and not is_blocked(requester_id, addressee_id)
  );

-- ============================================================
-- 2. Niente schema public per il ruolo anon
-- ============================================================

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Le policy "sempre vero" valgono per chi ha fatto accesso, non per chiunque.
drop policy if exists reviews_select_all on public.reviews;
create policy reviews_select_all on public.reviews
  for select to authenticated using (true);

drop policy if exists review_comments_select_all on public.review_comments;
create policy review_comments_select_all on public.review_comments
  for select to authenticated using (true);

drop policy if exists review_likes_select_all on public.review_likes;
create policy review_likes_select_all on public.review_likes
  for select to authenticated using (true);

drop policy if exists titles_select_all on public.titles;
create policy titles_select_all on public.titles
  for select to authenticated using (true);

drop policy if exists title_providers_select_all on public.title_providers;
create policy title_providers_select_all on public.title_providers
  for select to authenticated using (true);

drop policy if exists title_provider_links_select_all on public.title_provider_links;
create policy title_provider_links_select_all on public.title_provider_links
  for select to authenticated using (true);

drop policy if exists title_trailers_select_all on public.title_trailers;
create policy title_trailers_select_all on public.title_trailers
  for select to authenticated using (true);

drop policy if exists title_charts_select_all on public.title_charts;
create policy title_charts_select_all on public.title_charts
  for select to authenticated using (true);

drop policy if exists title_ratings_select_all on public.title_ratings;
create policy title_ratings_select_all on public.title_ratings
  for select to authenticated using (true);

drop policy if exists profiles_select_visible on public.profiles;
create policy profiles_select_visible on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or ((not is_blocked(auth.uid(), id)) and ((not is_private) or are_friends(auth.uid(), id)))
  );

-- ============================================================
-- 3. Un utente aggiorna solo le colonne che gli servono
-- ============================================================

-- `profiles`: nome, avatar, privacy, fine onboarding. Mai `id` o le date di sistema.
revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url, is_private, onboarding_completed_at)
  on public.profiles to authenticated;

-- `recommendations`: il destinatario segna "visto", non riscrive il consiglio.
revoke update on public.recommendations from authenticated;
grant update (seen_at) on public.recommendations to authenticated;

drop policy if exists recommendations_update_seen on public.recommendations;
create policy recommendations_update_seen on public.recommendations
  for update to authenticated
  using (to_user = auth.uid())
  with check (to_user = auth.uid());

-- ============================================================
-- 4. Vincoli sui dati
-- ============================================================

-- Le stagioni possono essere numerate per anno ("Stagione 2014"): tetto alto.
-- Il file del biglietto sta nella cartella dell'utente (la storage policy lo
-- impone al caricamento; qui lo impone anche alla riga, che e' cio' che poi
-- viene firmato).
alter table public.cinema_plans drop constraint if exists cinema_plans_ticket_path_own;
alter table public.cinema_plans add constraint cinema_plans_ticket_path_own
  check (ticket_path is null or ticket_path like (user_id::text || '/%'));

alter table public.watch_entries drop constraint if exists watch_entries_progress_check;
alter table public.watch_entries add constraint watch_entries_progress_check
  check (
    (season_number is null or (season_number >= 0 and season_number <= 3000))
    and (episode_number is null or (episode_number >= 0 and episode_number <= 10000))
  );

-- ============================================================
-- 5. Le funzioni di amicizia rispondono solo su se stessi
-- ============================================================
-- `are_friends`/`is_blocked` sono SECURITY DEFINER ed esposte come RPC a chi ha
-- fatto accesso (servono dentro le policy). Cosi' com'erano rispondevano su una
-- coppia qualsiasi di utenti: bastava mappare username -> id con `user_search`
-- per ricostruire il grafo delle amicizie altrui. Ora, dentro la sessione di un
-- utente, una delle due parti dev'essere lui. Nei trigger e nei job (auth.uid()
-- nullo) il comportamento non cambia.

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select case
    when auth.uid() is not null and a is distinct from auth.uid() and b is distinct from auth.uid()
      then false
    else exists (
      select 1 from public.friendships
      where status = 'accepted'
        and ((requester_id = a and addressee_id = b)
          or (requester_id = b and addressee_id = a))
    )
  end;
$fn$;

create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select case
    when auth.uid() is not null and a is distinct from auth.uid() and b is distinct from auth.uid()
      then false
    else exists (
      select 1 from public.friendships
      where status = 'blocked'
        and ((requester_id = a and addressee_id = b)
          or (requester_id = b and addressee_id = a))
    )
  end;
$fn$;

revoke all on function public.are_friends(uuid, uuid) from anon;
revoke all on function public.is_blocked(uuid, uuid) from anon;
revoke all on function public.can_see_activity(uuid) from anon;
revoke all on function public.import_watch_entries(jsonb) from anon;
revoke all on function public.report_count(text, uuid) from anon;
