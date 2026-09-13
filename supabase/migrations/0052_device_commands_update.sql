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

-- Solo le colonne che la TV e l'ingest devono toccare: l'esito del lancio e la
-- vita della dichiarazione. Tutto il resto (proprietario, titolo, scadenza)
-- resta immutabile dal client, come per device_members.paused_until (0033).
revoke update on public.device_commands from authenticated;
grant update (result, last_position_ms, last_seen_at) on public.device_commands to authenticated;
