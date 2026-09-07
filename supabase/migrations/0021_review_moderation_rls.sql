-- La moderazione delle recensioni (3 segnalazioni distinte = recensione
-- nascosta) viveva solo nel filtro `.lt("report_count", 3)` della query in
-- `TitleReviews.tsx`, e la vista `reviews_with_counts` e' SECURITY DEFINER:
-- bastava interrogare la vista senza quel filtro, o la tabella `reviews`
-- direttamente, per rileggere tutto cio' che era stato nascosto.
--
-- Il conteggio diventa una colonna tenuta da un trigger su `reports`. Cosi'
-- puo' entrare nella RLS come semplice confronto su colonna (nessuna
-- sottoquery per riga) e la vista puo' tornare SECURITY INVOKER: restano solo
-- i conteggi di like e commenti, che stanno su tabelle leggibili da chiunque
-- abbia fatto accesso. Il conteggio delle segnalazioni non poteva restare una
-- sottoquery nella vista invoker, perche' `reports_select_own` mostra a
-- ciascuno solo le proprie segnalazioni e il totale sarebbe sempre stato 0.

alter table public.reviews
  add column if not exists report_count integer not null default 0;

update public.reviews r
set report_count = (
  select count(distinct rp.reporter_id)
  from public.reports rp
  where rp.target_type = 'review' and rp.target_id = r.id
);

create or replace function public.sync_review_report_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare target uuid;
begin
  if coalesce(new.target_type, old.target_type) <> 'review' then
    return coalesce(new, old);
  end if;
  target := coalesce(new.target_id, old.target_id);
  update public.reviews r
     set report_count = (
       select count(distinct rp.reporter_id)
       from public.reports rp
       where rp.target_type = 'review' and rp.target_id = r.id
     )
   where r.id = target;
  return coalesce(new, old);
end;
$fn$;

drop trigger if exists sync_review_report_count on public.reports;
create trigger sync_review_report_count
  after insert or update or delete on public.reports
  for each row execute function public.sync_review_report_count();

-- `report_count` non si scrive a mano. Il grant di UPDATE copre tutte le
-- colonne del payload perche' l'upsert di PostgREST genera un
-- ON CONFLICT DO UPDATE su ognuna di esse.
revoke insert on public.reviews from authenticated;
grant insert (id, user_id, title_id, media_type, body, has_spoilers)
  on public.reviews to authenticated;
revoke update on public.reviews from authenticated;
grant update (user_id, title_id, media_type, body, has_spoilers)
  on public.reviews to authenticated;

drop policy if exists reviews_select_all on public.reviews;
drop policy if exists reviews_select_visible on public.reviews;
create policy reviews_select_visible on public.reviews
  for select to authenticated
  using (user_id = auth.uid() or report_count < 3);

-- `report_count` resta bigint nella vista: era il tipo del vecchio count(*) e
-- `create or replace view` non permette di cambiarlo.
create or replace view public.reviews_with_counts
with (security_invoker = true) as
  select r.id, r.user_id, r.title_id, r.media_type, r.body, r.has_spoilers,
         r.created_at, r.updated_at,
         (select count(*) from public.review_likes l where l.review_id = r.id) as like_count,
         (select count(*) from public.review_comments c where c.review_id = r.id) as comment_count,
         r.report_count::bigint as report_count
  from public.reviews r;

revoke all on public.reviews_with_counts from anon;
grant select on public.reviews_with_counts to authenticated;

-- Le funzioni di trigger non le deve chiamare nessuno: senza revoca finiscono
-- esposte come `/rest/v1/rpc/...`, e sono SECURITY DEFINER.
revoke all on function public.friendships_parties_immutable() from anon, authenticated, public;
revoke all on function public.sync_review_report_count() from anon, authenticated, public;

-- `report_count(text, uuid)` non serve piu': il conteggio e' una colonna.
revoke all on function public.report_count(text, uuid) from anon, authenticated, public;
