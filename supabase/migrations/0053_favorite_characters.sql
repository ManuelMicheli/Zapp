-- Personaggio preferito: un voto per utente per titolo, sulla persona del cast
-- (`titles.raw->credits->cast[].id`). Il grafico nella scheda titolo legge i
-- voti solo in aggregato, tramite `character_vote_counts`: il voto del singolo
-- lo vede solo lui.

create table public.favorite_characters (
  user_id uuid not null references public.profiles (id) on delete cascade,
  title_id bigint not null,
  media_type public.media_type not null,
  -- id TMDB della persona: non c'è una tabella persone, il cast sta in titles.raw
  person_id bigint not null check (person_id > 0),
  -- nome del personaggio al momento del voto: se TMDB cambia il cast la riga
  -- resta leggibile nel grafico
  character_name text not null check (char_length(character_name) between 0 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, title_id, media_type),
  foreign key (title_id, media_type) references public.titles (id, media_type) on delete cascade
);

-- il grafico aggrega per titolo
create index favorite_characters_title_idx
  on public.favorite_characters (title_id, media_type, person_id);

create trigger favorite_characters_set_updated_at
  before update on public.favorite_characters
  for each row execute function public.set_updated_at();

alter table public.favorite_characters enable row level security;

-- Solo la propria riga, in lettura e scrittura: il `with check` ripete la
-- proprietà (regola di security.md), la chiave primaria impedisce doppioni.
create policy "favorite_characters_select_own" on public.favorite_characters
  for select to authenticated
  using (user_id = auth.uid());

create policy "favorite_characters_insert_own" on public.favorite_characters
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "favorite_characters_update_own" on public.favorite_characters
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "favorite_characters_delete_own" on public.favorite_characters
  for delete to authenticated
  using (user_id = auth.uid());

-- Conteggi per titolo su tutti gli utenti. SECURITY DEFINER come
-- title_rating_histogram: la policy fa vedere solo la propria riga, e il grafico
-- deve contare tutti. Ritorna solo numeri e il nome del personaggio, mai chi ha
-- votato. `character` è quello della riga più recente per quella persona.
create or replace function public.character_vote_counts(t_id bigint, t_type public.media_type)
returns table(person_id bigint, character_name text, votes bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    f.person_id,
    (array_agg(f.character_name order by f.updated_at desc))[1] as character_name,
    count(*) as votes
  from public.favorite_characters f
  where f.title_id = t_id and f.media_type = t_type
  group by f.person_id
  order by count(*) desc, min(f.created_at) asc;
$$;

revoke all on function public.character_vote_counts(bigint, public.media_type) from public, anon;
grant execute on function public.character_vote_counts(bigint, public.media_type) to authenticated;

-- ============ grant ============
revoke all on public.favorite_characters from anon;
grant select, insert, delete on public.favorite_characters to authenticated;
-- l'upsert di PostgREST fa `on conflict do update` su tutte le colonne del
-- payload: il grant di update deve coprirle tutte
grant update (user_id, title_id, media_type, person_id, character_name)
  on public.favorite_characters to authenticated;
