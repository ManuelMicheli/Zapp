-- La domanda del giorno: una domanda al giorno, una risposta per utente
-- (un titolo + un motivo facoltativo), e il giorno dopo il podio dei tre
-- titoli più scelti.
-- Spec: docs/superpowers/specs/2026-09-08-domanda-del-giorno-design.md

-- ============ domande ============
create table public.daily_questions (
  id uuid primary key default gen_random_uuid(),
  ask_on date not null unique,
  text text not null check (char_length(text) between 8 and 200),
  media_scope text not null default 'any'
    check (media_scope in ('movie', 'tv', 'any')),
  created_at timestamptz not null default now()
);

alter table public.daily_questions enable row level security;

-- Solo le domande già uscite: altrimenti si sfogliano in anticipo quelle future.
create policy "daily_questions_select_past" on public.daily_questions
  for select to authenticated
  using (ask_on <= (now() at time zone 'Europe/Rome')::date);

-- ============ risposte ============
create table public.daily_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.daily_questions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title_id bigint not null,
  media_type public.media_type not null,
  reason text check (char_length(reason) <= 140),
  report_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, user_id),
  foreign key (title_id, media_type) references public.titles (id, media_type)
);

create index daily_answers_question_idx
  on public.daily_answers (question_id, created_at desc);

alter table public.daily_answers enable row level security;

-- `stable`, non `security definer`: la policy su daily_questions lascia già
-- vedere la domanda di oggi. Revocata da anon/authenticated/public perché una
-- funzione raggiungibile da PostgREST è un endpoint in più senza motivo.
create or replace function public.is_today_question(q_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select exists (
    select 1 from public.daily_questions q
    where q.id = q_id
      and q.ask_on = (now() at time zone 'Europe/Rome')::date
  );
$$;

revoke all on function public.is_today_question(uuid) from public, anon, authenticated;

create policy "daily_answers_select" on public.daily_answers
  for select to authenticated
  using (report_count < 3 and not public.is_blocked(auth.uid(), user_id));

create policy "daily_answers_insert_own" on public.daily_answers
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_today_question(question_id));

-- Il `with check` ripete proprietà e giorno: senza, con una sessione si riscrive
-- col PostgREST la propria risposta di ieri e si cambia una classifica pubblicata.
create policy "daily_answers_update_own" on public.daily_answers
  for update to authenticated
  using (user_id = auth.uid() and public.is_today_question(question_id))
  with check (user_id = auth.uid() and public.is_today_question(question_id));

create policy "daily_answers_delete_own" on public.daily_answers
  for delete to authenticated
  using (user_id = auth.uid() and public.is_today_question(question_id));

-- Il `with check` non vede la riga vecchia: senza questo trigger si sposta la
-- propria risposta su un'altra domanda, o la si intesta a un altro utente.
create or replace function public.daily_answers_keys_immutable()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
begin
  if new.question_id <> old.question_id or new.user_id <> old.user_id then
    raise exception 'question_id e user_id non si cambiano';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

revoke all on function public.daily_answers_keys_immutable()
  from public, anon, authenticated;

create trigger daily_answers_keys_immutable
  before update on public.daily_answers
  for each row execute function public.daily_answers_keys_immutable();

-- ============ "il popup di oggi l'ho già visto" ============
-- Sta in DB e non in localStorage: regola del progetto (nessun dato utente nel
-- browser) ed è anche il motivo per cui non ricompare su un altro dispositivo.
create table public.daily_question_views (
  user_id uuid not null references public.profiles (id) on delete cascade,
  ask_on date not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, ask_on)
);

alter table public.daily_question_views enable row level security;

create policy "daily_question_views_select_own" on public.daily_question_views
  for select to authenticated using (user_id = auth.uid());
create policy "daily_question_views_insert_own" on public.daily_question_views
  for insert to authenticated with check (user_id = auth.uid());

-- ============ segnalazioni: si riusa la tabella generica ============
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('review', 'comment', 'daily_answer'));

create or replace function public.sync_daily_answer_report_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare target uuid;
begin
  if coalesce(new.target_type, old.target_type) <> 'daily_answer' then
    return coalesce(new, old);
  end if;
  target := coalesce(new.target_id, old.target_id);
  update public.daily_answers a
     set report_count = (
       select count(distinct rp.reporter_id)
       from public.reports rp
       where rp.target_type = 'daily_answer' and rp.target_id = a.id
     )
   where a.id = target;
  return coalesce(new, old);
end;
$fn$;

revoke all on function public.sync_daily_answer_report_count()
  from public, anon, authenticated;

create trigger sync_daily_answer_report_count
  after insert or delete on public.reports
  for each row execute function public.sync_daily_answer_report_count();

-- ============ podio ============
-- SECURITY DEFINER come title_rating_histogram: il conteggio dev'essere su tutti
-- gli utenti, mentre le policy nascondono le righe dei bloccati. Ritorna solo
-- numeri, nessun dato personale. `day < oggi`: la classifica di oggi non si legge
-- prima di sera, altrimenti si risponde guardando i risultati.
create or replace function public.daily_question_podium(day date)
returns table(
  title_id bigint,
  media_type public.media_type,
  votes bigint,
  first_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.title_id, a.media_type, count(*), min(a.created_at)
  from public.daily_answers a
  join public.daily_questions q on q.id = a.question_id
  where q.ask_on = day
    and day < (now() at time zone 'Europe/Rome')::date
  group by a.title_id, a.media_type
  order by count(*) desc, min(a.created_at) asc
  limit 3;
$$;

revoke all on function public.daily_question_podium(date) from public, anon;
grant execute on function public.daily_question_podium(date) to authenticated;

-- ============ grant ============
revoke all on public.daily_questions from anon;
revoke all on public.daily_answers from anon;
revoke all on public.daily_question_views from anon;

grant select on public.daily_questions to authenticated;
grant select, insert, delete on public.daily_answers to authenticated;
-- Mai `report_count`: lo tiene il trigger, come su `reviews`.
grant update (title_id, media_type, reason) on public.daily_answers to authenticated;
grant select, insert on public.daily_question_views to authenticated;
