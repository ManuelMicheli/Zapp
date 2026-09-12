-- DSA art. 16: chi subisce una rimozione deve sapere che è avvenuta e perché;
-- chi ha segnalato deve conoscere l'esito. Finora non arrivava niente a nessuno:
-- il contenuto spariva e basta.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'friend_request', 'friend_accepted', 'recommendation', 'comment', 'like',
    'content_hidden', 'report_outcome'
  ));

-- `report_count` esiste su tre tabelle, non su una: `reviews`, `title_comments` e
-- `daily_answers`, tutte con le stesse colonne `id, user_id, title_id,
-- media_type`. Un meccanismo che avvisa per le recensioni e tace sui commenti
-- sarebbe un obbligo fatto a metà: il tipo di bersaglio arriva da `tg_argv[0]` e
-- usa gli stessi valori di `reports.target_type`.
create or replace function public.notify_content_hidden()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  tipo_bersaglio text := tg_argv[0];
begin
  -- Solo l'attraversamento della soglia, non ogni segnalazione successiva: senza
  -- questa guardia, dalla quarta in poi l'autore riceve una notifica per
  -- ciascuna segnalazione. E le funzioni di sincronizzazione riscrivono la
  -- colonna a ogni report, anche quando il valore non cambia.
  if new.report_count < 3 or coalesce(old.report_count, 0) >= 3 then
    return new;
  end if;

  -- All'autore: cosa è sparito. Nessun `from_user`: è il sistema, non una persona.
  insert into public.notifications (user_id, kind, payload)
  values (
    new.user_id,
    'content_hidden',
    jsonb_build_object(
      'target_type', tipo_bersaglio,
      'target_id', new.id,
      'title_id', new.title_id,
      'media_type', new.media_type
    )
  );

  -- A chi ha segnalato: l'esito. `distinct` perché la stessa persona potrebbe
  -- aver segnalato più volte lo stesso contenuto.
  insert into public.notifications (user_id, kind, payload)
  select distinct
    r.reporter_id,
    'report_outcome',
    jsonb_build_object(
      'target_type', tipo_bersaglio,
      'target_id', new.id,
      'title_id', new.title_id,
      'media_type', new.media_type,
      'outcome', 'hidden'
    )
  from public.reports r
  where r.target_type = tipo_bersaglio and r.target_id = new.id;

  return new;
end;
$fn$;

drop trigger if exists notify_content_hidden_reviews on public.reviews;
create trigger notify_content_hidden_reviews
  after update of report_count on public.reviews
  for each row execute function public.notify_content_hidden('review');

drop trigger if exists notify_content_hidden_title_comments on public.title_comments;
create trigger notify_content_hidden_title_comments
  after update of report_count on public.title_comments
  for each row execute function public.notify_content_hidden('title_comment');

drop trigger if exists notify_content_hidden_daily_answers on public.daily_answers;
create trigger notify_content_hidden_daily_answers
  after update of report_count on public.daily_answers
  for each row execute function public.notify_content_hidden('daily_answer');

-- Le funzioni di trigger si revocano sempre: sono SECURITY DEFINER e senza questo
-- Supabase le espone come /rest/v1/rpc/notify_content_hidden.
revoke execute on function public.notify_content_hidden() from public, anon, authenticated;
