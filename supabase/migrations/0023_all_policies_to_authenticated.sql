-- Restavano 44 policy scritte `to public`. Hanno tutte una condizione su
-- `auth.uid()`, quindi per `anon` erano gia' vuote (e ad `anon` sono comunque
-- revocati i grant dalla 0020). Diventano esplicite: cosi' la regola "ogni policy
-- dice authenticated" vale senza eccezioni ed e' verificabile con una query sola
--
--   select count(*) from pg_policies where schemaname='public' and roles::text='{public}';
--
-- invece di dover rileggere ogni volta la condizione per convincersi che anon non
-- passi. Il ciclo riscrive ogni policy conservandone comando, `using` e
-- `with check`: e' ripetibile, e su un database gia' a posto non fa niente.

do $$
declare p record; sql text;
begin
  for p in
    select policyname, tablename, permissive, cmd, qual, with_check
    from pg_policies where schemaname='public' and roles::text='{public}'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    sql := format('create policy %I on public.%I as %s for %s to authenticated',
      p.policyname, p.tablename,
      case when p.permissive='PERMISSIVE' then 'permissive' else 'restrictive' end,
      case p.cmd when 'ALL' then 'all' when 'SELECT' then 'select'
                 when 'INSERT' then 'insert' when 'UPDATE' then 'update'
                 when 'DELETE' then 'delete' end);
    if p.qual is not null then sql := sql || ' using (' || p.qual || ')'; end if;
    if p.with_check is not null then sql := sql || ' with check (' || p.with_check || ')'; end if;
    execute sql;
  end loop;
end $$;
