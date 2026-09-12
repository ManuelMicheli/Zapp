-- Abbinamento di una TV: la TV genera il token, il server ne vede solo l'hash.
-- Nessuna policy: ci arriva solo il service client dalle rotte. Un codice a sei
-- cifre leggibile da chiunque sarebbe un dispositivo regalato a uno sconosciuto.
create table public.pairing_codes (
  code text primary key check (code ~ '^[0-9]{6}$'),
  install_id uuid not null,
  token_hash text not null,
  name text not null,
  platform public.device_platform not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_by uuid references public.profiles (id) on delete cascade,
  claimed_at timestamptz
);

create index pairing_codes_scadenza_idx on public.pairing_codes (expires_at);
create index pairing_codes_claimed_by_idx on public.pairing_codes (claimed_by);

alter table public.pairing_codes enable row level security;
revoke all on public.pairing_codes from anon, authenticated;

-- Reclamo: crea il dispositivo se l'install_id e' nuovo, aggiunge il membro.
-- security definer perche' la tabella e' chiusa; revocata da anon e public.
create or replace function public.claim_pairing_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_riga public.pairing_codes;
  v_device public.devices;
begin
  if v_uid is null then
    raise exception 'non autenticato' using errcode = '28000';
  end if;

  select * into v_riga
  from public.pairing_codes
  where code = p_code and expires_at > now()
  for update;

  if not found then
    raise exception 'codice non valido' using errcode = 'P0002';
  end if;

  select * into v_device from public.devices where install_id = v_riga.install_id;

  if not found then
    insert into public.devices (install_id, token_hash, name, platform)
    values (v_riga.install_id, v_riga.token_hash, v_riga.name, v_riga.platform)
    returning * into v_device;
  end if;

  insert into public.device_members (device_id, user_id)
  values (v_device.id, v_uid)
  on conflict (device_id, user_id) do nothing;

  update public.pairing_codes
  set claimed_by = v_uid, claimed_at = now()
  where code = p_code;

  return jsonb_build_object('device_id', v_device.id, 'name', v_device.name);
end;
$$;

revoke all on function public.claim_pairing_code(text) from anon, public;
grant execute on function public.claim_pairing_code(text) to authenticated;
