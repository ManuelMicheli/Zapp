-- Le tabelle della fase A (segnali utente) sono nate dopo la revoca ad `anon` di
-- 0020 e sono gia' chiuse: le `alter default privileges` hanno funzionato. Le
-- policy pero' restano scritte `to public`: si allineano alle altre, cosi' la
-- regola "ogni policy dice authenticated" vale senza eccezioni e una `grant`
-- distratta in futuro non riapre `title_similar`, l'unica con USING true.

drop policy if exists title_similar_select_all on public.title_similar;
create policy title_similar_select_all on public.title_similar
  for select to authenticated using (true);

drop policy if exists user_preferences_select_own on public.user_preferences;
create policy user_preferences_select_own on public.user_preferences
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own on public.user_preferences
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own on public.user_preferences
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists user_events_select_own on public.user_events;
create policy user_events_select_own on public.user_events
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists user_events_insert_own on public.user_events;
create policy user_events_insert_own on public.user_events
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists user_events_delete_own on public.user_events;
create policy user_events_delete_own on public.user_events
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists user_seed_picks_select_own on public.user_seed_picks;
create policy user_seed_picks_select_own on public.user_seed_picks
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists user_seed_picks_insert_own on public.user_seed_picks;
create policy user_seed_picks_insert_own on public.user_seed_picks
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists user_seed_picks_delete_own on public.user_seed_picks;
create policy user_seed_picks_delete_own on public.user_seed_picks
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists user_taste_select_own on public.user_taste;
create policy user_taste_select_own on public.user_taste
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists user_taste_delete_own on public.user_taste;
create policy user_taste_delete_own on public.user_taste
  for delete to authenticated using (auth.uid() = user_id);

-- Ripetuta perche' le tabelle nuove arrivano di continuo: e' la rete di sicurezza
-- se una migration futura concede qualcosa ad `anon` senza accorgersene.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
