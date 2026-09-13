-- La TV riferisce l'esito del lancio e l'ingest aggiorna la dichiarazione:
-- entrambi per conto di un membro del dispositivo.
drop policy if exists device_commands_update_own on public.device_commands;
create policy device_commands_update_own on public.device_commands
  for update to authenticated
  using (
    exists (
      select 1 from public.device_members m
      where m.device_id = device_commands.device_id
        and m.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.device_members m
      where m.device_id = device_commands.device_id
        and m.user_id = (select auth.uid())
    )
  );
