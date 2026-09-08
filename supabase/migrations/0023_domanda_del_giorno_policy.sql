-- `is_today_question` era una funzione SECURITY INVOKER richiamata dalle policy
-- di `daily_answers` e revocata da `authenticated` per non farla comparire come
-- `/rest/v1/rpc/is_today_question`. Ma una policy viene valutata **con il ruolo
-- di chi scrive**: senza `execute`, ogni risposta veniva rifiutata con
-- `permission denied for function is_today_question` (42501) e l'utente vedeva
-- solo "Non è riuscito, riprova" (verificato con Playwright su una build di
-- produzione, 2026-09-08).
--
-- Concederle l'`execute` avrebbe risolto aprendo però un endpoint in più. La
-- condizione sta direttamente nelle policy: stesso significato, nessuna
-- funzione da esporre.

drop policy "daily_answers_insert_own" on public.daily_answers;
drop policy "daily_answers_update_own" on public.daily_answers;
drop policy "daily_answers_delete_own" on public.daily_answers;

drop function if exists public.is_today_question(uuid);

create policy "daily_answers_insert_own" on public.daily_answers
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.daily_questions q
      where q.id = question_id
        and q.ask_on = (now() at time zone 'Europe/Rome')::date
    )
  );

-- Il `with check` ripete proprietà e giorno: senza, con una sessione si riscrive
-- col PostgREST la propria risposta di ieri e si cambia una classifica pubblicata.
create policy "daily_answers_update_own" on public.daily_answers
  for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.daily_questions q
      where q.id = question_id
        and q.ask_on = (now() at time zone 'Europe/Rome')::date
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.daily_questions q
      where q.id = question_id
        and q.ask_on = (now() at time zone 'Europe/Rome')::date
    )
  );

create policy "daily_answers_delete_own" on public.daily_answers
  for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.daily_questions q
      where q.id = question_id
        and q.ask_on = (now() at time zone 'Europe/Rome')::date
    )
  );
