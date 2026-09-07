-- upsert "Ci vado": il ramo ON CONFLICT DO UPDATE richiede una policy update.
-- Applicata al progetto il 2026-09-05 (versione DB 20260905104227); il file
-- mancava dal repo. `drop ... if exists` la rende ripetibile.
drop policy if exists "cinema_plans_update_own" on public.cinema_plans;

create policy "cinema_plans_update_own" on public.cinema_plans
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
