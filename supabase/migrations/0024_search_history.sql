-- Ricerche recenti: i titoli che l'utente ha aperto dalla ricerca, per
-- riproporglieli quando tocca di nuovo la barra.
-- Niente localStorage (regola del progetto) e nessun join su `titles`: la riga
-- di `titles` viene scritta dopo, aprendo la scheda, mentre qui la voce serve
-- subito. Titolo, locandina e anno arrivano dal risultato di ricerca e restano
-- una fotografia di quel momento.

create table public.search_history (
  user_id uuid not null references public.profiles (id) on delete cascade,
  title_id bigint not null,
  media_type public.media_type not null,
  title text not null check (char_length(title) between 1 and 200),
  poster_path text check (char_length(poster_path) <= 200),
  year integer check (year between 1870 and 2200),
  searched_at timestamptz not null default now(),
  primary key (user_id, title_id, media_type)
);

create index search_history_recent_idx
  on public.search_history (user_id, searched_at desc);

alter table public.search_history enable row level security;

create policy "search_history_select_own" on public.search_history
  for select to authenticated using (user_id = auth.uid());

create policy "search_history_insert_own" on public.search_history
  for insert to authenticated with check (user_id = auth.uid());

-- L'upsert risale la riga in cima invece di duplicarla. Il `with check` ripete
-- la proprieta': senza, con una sessione si riscrive lo storico di un altro.
create policy "search_history_update_own" on public.search_history
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "search_history_delete_own" on public.search_history
  for delete to authenticated using (user_id = auth.uid());

-- La potatura sta qui e non nel client: una riga in piu' per ogni titolo aperto
-- crescerebbe senza limite, e farla dal client costerebbe due giri in piu' a
-- ogni tocco. Solo sull'insert: l'upsert che aggiorna non cambia il conteggio.
create or replace function public.prune_search_history()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  delete from public.search_history h
   where h.user_id = new.user_id
     and h.searched_at < (
       select s.searched_at from public.search_history s
        where s.user_id = new.user_id
        order by s.searched_at desc
        offset 20 limit 1
     );
  return null;
end;
$fn$;

revoke all on function public.prune_search_history() from public, anon, authenticated;

create trigger prune_search_history
  after insert on public.search_history
  for each row execute function public.prune_search_history();

-- ============ grant ============
revoke all on public.search_history from anon;
-- Nessun grant per colonna: qui non c'e' una colonna che l'utente non debba
-- toccare (niente `report_count` e simili), la riga e' tutta sua, e l'upsert di
-- PostgREST genera comunque un ON CONFLICT DO UPDATE su tutte le colonne del
-- payload. A tenere le righe altrui al loro posto e' il `with check`.
grant select, insert, update, delete on public.search_history to authenticated;
