-- `auth.uid()` valutato una volta per query invece che per riga.
--
-- Postgres non considera `auth.uid()` una costante e lo rivaluta a ogni riga
-- esaminata dalla policy (advisor `auth_rls_initplan`, 57 policy su 69 il
-- 2026-09-08). Avvolgendolo in un sotto-select diventa un InitPlan: calcolato
-- una volta, poi confrontato come una costante. **La condizione non cambia**:
-- cambia solo il numero di valutazioni.
--
-- La riscrittura e' meccanica di proposito. Ricopiare a mano cinquantasette
-- policy di sicurezza e' esattamente il genere di lavoro in cui una parentesi
-- sbagliata apre un buco: qui il testo lo rilegge Postgres da `pg_policies` e
-- l'unica trasformazione e' una sostituzione. Il controllo sta a valle: prima e
-- dopo, l'insieme (tabella, nome, comando, ruoli, permissive) dev'essere
-- identico, e nessun `auth.uid()` deve restare nudo.
--
-- Rieseguibile: le policy gia' convertite non cambiano piu' e vengono saltate.
do $$
declare
  p record;
  q_nuovo text;
  c_nuovo text;
  ddl text;
begin
  for p in
    select tablename, policyname, cmd, permissive,
           array_to_string(roles, ', ') as ruoli, qual, with_check
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  loop
    -- `@U@` protegge le occorrenze gia' avvolte: `pg_policies` le mostra come
    -- `( SELECT auth.uid() AS uid)` e senza questo passaggio verrebbero avvolte
    -- una seconda volta.
    q_nuovo := replace(replace(replace(p.qual,
      '( SELECT auth.uid() AS uid)', '@U@'),
      'auth.uid()', '(select auth.uid())'),
      '@U@', '(select auth.uid())');
    c_nuovo := replace(replace(replace(p.with_check,
      '( SELECT auth.uid() AS uid)', '@U@'),
      'auth.uid()', '(select auth.uid())'),
      '@U@', '(select auth.uid())');

    continue when q_nuovo is not distinct from p.qual
             and c_nuovo is not distinct from p.with_check;

    execute format('drop policy %I on public.%I', p.policyname, p.tablename);

    ddl := format('create policy %I on public.%I as %s for %s to %s',
                  p.policyname, p.tablename,
                  case when p.permissive = 'PERMISSIVE' then 'permissive'
                       else 'restrictive' end,
                  lower(p.cmd), p.ruoli);
    if q_nuovo is not null then ddl := ddl || format(' using (%s)', q_nuovo); end if;
    if c_nuovo is not null then ddl := ddl || format(' with check (%s)', c_nuovo); end if;
    execute ddl;
  end loop;
end $$;

-- Rete di sicurezza: se qualcosa fosse rimasto indietro, la migration fallisce
-- qui invece di lasciare il database a meta'.
do $$
declare rimasti int;
begin
  select count(*) into rimasti
  from pg_policies
  where schemaname = 'public'
    and (replace(coalesce(qual, ''), '( SELECT auth.uid() AS uid)', '@') like '%auth.uid()%'
      or replace(coalesce(with_check, ''), '( SELECT auth.uid() AS uid)', '@') like '%auth.uid()%');
  if rimasti > 0 then
    raise exception 'restano % policy con auth.uid() non avvolto', rimasti;
  end if;
end $$;
