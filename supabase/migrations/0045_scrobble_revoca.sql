-- Revocare il consenso `scrobble` deve cancellare davvero le sessioni raccolte.
--
-- Senza queste policy la cancellazione fallisce **in silenzio**: RLS non lascia
-- passare la DELETE, PostgREST non restituisce errore (zero righe toccate non è
-- un errore) e l'interfaccia direbbe "fatto" mentre i dati sono ancora lì. È il
-- caso peggiore possibile per una revoca di consenso.
--
-- Il predicato è lo stesso della SELECT già esistente su ciascuna tabella: si
-- cancella esattamente ciò che si può leggere, niente di più.

grant delete on public.watch_sessions to authenticated;

drop policy if exists watch_sessions_delete_own on public.watch_sessions;
create policy watch_sessions_delete_own on public.watch_sessions
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant delete on public.pending_scrobbles to authenticated;

-- `pending_scrobbles` ha righe con `user_id` nullo: sono gli eventi di un
-- dispositivo con più membri, non ancora attribuiti. Chi è membro di quel
-- dispositivo li vede già (`pending_select_own`) e deve poterli cancellare,
-- altrimenti la revoca lascerebbe indietro proprio gli eventi in attesa.
drop policy if exists pending_delete_own on public.pending_scrobbles;
create policy pending_delete_own on public.pending_scrobbles
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (
      user_id is null
      and exists (
        select 1 from public.device_members m
        where m.device_id = pending_scrobbles.device_id
          and m.user_id = (select auth.uid())
      )
    )
  );
