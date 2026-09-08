-- Due policy permissive sullo stesso comando vengono valutate **entrambe** per
-- ogni riga: leggendo la propria libreria, Postgres chiamava comunque
-- are_friends() riga per riga per la seconda policy, che su quelle righe non
-- poteva mai essere vera. Diventano una sola, con la condizione propria per
-- prima cosi' che l'`or` corto-circuiti sul caso normale.
--
-- E are_friends(auth.uid(), user_id) e' una chiamata di funzione per riga: al
-- suo posto un insieme calcolato una volta sola per query.
--
-- Misura del banco (bench_scale, 500 utenti, 50.000 attivita'): il feed costava
-- 1.303 ms, e 1.295 ms gia' con 20 utenti. Non e' il volume: e' la forma.

create or replace function public.my_friend_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  -- Due rami uniti invece di `auth.uid() in (requester_id, addressee_id)`: cosi'
  -- il primo usa l'indice unico (requester_id, addressee_id) e il secondo
  -- friendships_addressee_idx (addressee_id, status). Con l'`or` non ne userebbe
  -- nessuno dei due.
  select f.addressee_id
  from public.friendships f
  where f.requester_id = auth.uid() and f.status = 'accepted'
  union
  select f.requester_id
  from public.friendships f
  where f.addressee_id = auth.uid() and f.status = 'accepted';
$fn$;

-- Stessa regola di sicurezza di are_friends: risponde solo sull'utente della
-- sessione, quindi non serve a nessuno per ricostruire il grafo altrui. Non e'
-- pensata come RPC: fuori dalle policy non la chiama nessuno.
revoke all on function public.my_friend_ids() from public, anon;
grant execute on function public.my_friend_ids() to authenticated, service_role;

drop policy if exists watch_entries_select_own on public.watch_entries;
drop policy if exists watch_entries_select_friends on public.watch_entries;
create policy watch_entries_select on public.watch_entries
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (not is_private and user_id in (select public.my_friend_ids()))
  );

drop policy if exists activities_select_own on public.activities;
drop policy if exists activities_select_friends on public.activities;
create policy activities_select on public.activities
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (not is_private and user_id in (select public.my_friend_ids()))
  );
