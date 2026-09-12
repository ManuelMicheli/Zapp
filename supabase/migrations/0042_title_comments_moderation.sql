-- I commenti sui titoli nascono senza moderazione e senza un modo per
-- toglierli di mezzo: `title_comments` (0041) ha la policy di lettura, quella di
-- inserimento e quella di cancellazione, ma niente `report_count`, quindi un
-- commento offensivo resta li' e l'unica difesa e' il blocco personale. Su
-- `reviews` (0021) e su `daily_answers` (0022) la regola e' gia' scritta e vale
-- anche qui: **la visibilita' sta nella RLS, non in un filtro della query**.
--
-- Seconda cosa: la policy di lettura chiamava `is_blocked(auth.uid(), user_id)`,
-- cioe' una funzione SECURITY DEFINER **per ogni riga esaminata**, ed e' l'errore
-- misurato nel banco di prova del 2026-09-08 (il feed passo' da 1.239 ms a
-- 0,8 ms togliendolo). La pagina di una stagione ne legge fino a 200 alla volta.
-- Ora l'elenco dei bloccati si calcola una volta sola, come `my_friend_ids()`.

-- ============ chi mi ha bloccato, o chi ho bloccato io ============
-- Stessa forma e stessa ragione di `my_friend_ids()`: le policy la devono poter
-- chiamare, non ha argomenti e quindi risponde solo sull'utente della sessione.
create or replace function public.my_blocked_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when f.requester_id = (select auth.uid()) then f.addressee_id
           else f.requester_id
         end
  from public.friendships f
  where f.status = 'blocked'
    and (select auth.uid()) in (f.requester_id, f.addressee_id);
$$;

revoke all on function public.my_blocked_ids() from public, anon;
grant execute on function public.my_blocked_ids() to authenticated;

-- ============ moderazione ============
alter table public.title_comments
  add column if not exists report_count integer not null default 0;

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('review', 'comment', 'daily_answer', 'title_comment'));

create or replace function public.sync_title_comment_report_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare target uuid;
begin
  if coalesce(new.target_type, old.target_type) <> 'title_comment' then
    return coalesce(new, old);
  end if;
  target := coalesce(new.target_id, old.target_id);
  update public.title_comments c
     set report_count = (
       select count(distinct rp.reporter_id)
       from public.reports rp
       where rp.target_type = 'title_comment' and rp.target_id = c.id
     )
   where c.id = target;
  return coalesce(new, old);
end;
$fn$;

-- Una funzione di trigger non va esposta come `/rest/v1/rpc/...`.
revoke all on function public.sync_title_comment_report_count()
  from public, anon, authenticated;

drop trigger if exists sync_title_comment_report_count on public.reports;
create trigger sync_title_comment_report_count
  after insert or delete on public.reports
  for each row execute function public.sync_title_comment_report_count();

-- ============ policy riscritte ============
drop policy if exists title_comments_select on public.title_comments;
create policy title_comments_select on public.title_comments
for select to authenticated
using (
  -- L'autore vede sempre il proprio commento, anche segnalato: sparisce agli
  -- altri, non a chi l'ha scritto (stessa regola di `reviews`).
  user_id = (select auth.uid())
  or (report_count < 3 and user_id not in (select public.my_blocked_ids()))
);

drop policy if exists title_comments_insert on public.title_comments;
create policy title_comments_insert on public.title_comments
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists title_comments_delete on public.title_comments;
create policy title_comments_delete on public.title_comments
for delete to authenticated
using (user_id = (select auth.uid()));

-- Nessun grant di UPDATE: `report_count` lo scrive solo il trigger, e il corpo
-- di un commento non si modifica (si cancella e si riscrive).
revoke all on public.title_comments from anon;
grant select, insert, delete on public.title_comments to authenticated;
