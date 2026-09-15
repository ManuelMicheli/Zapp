-- Abbinamento dalla rete locale: il telefono trova la TV, la TV chiede conferma
-- a schermo e registra qui il consenso. Sulla LAN non viaggia nessun segreto,
-- solo il device_id del telefono: la prova e' la sessione di chi reclama.
alter table public.pairing_codes
  add column consent_device_id uuid references public.devices (id) on delete cascade;

create index pairing_codes_consenso_idx
  on public.pairing_codes (install_id, consent_device_id)
  where consent_device_id is not null;

-- Il corpo del reclamo, estratto da claim_pairing_code: due copie di questa
-- logica divergerebbero alla prima modifica. Resta security definer perche'
-- pairing_codes e devices sono chiuse; e' revocata anche ad authenticated,
-- perche' la chiamano solo le due funzioni qui sotto — dentro le quali
-- current_user e' il proprietario, non l'utente.
create or replace function public._claim_pairing_row(
  p_riga public.pairing_codes,
  p_uid uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.devices;
begin
  select * into v_device from public.devices where install_id = p_riga.install_id;

  if not found then
    insert into public.devices (install_id, token_hash, name, platform)
    values (p_riga.install_id, p_riga.token_hash, p_riga.name, p_riga.platform)
    returning * into v_device;
  end if;

  insert into public.device_members (device_id, user_id)
  values (v_device.id, p_uid)
  on conflict (device_id, user_id) do nothing;

  update public.pairing_codes
  set claimed_by = p_uid, claimed_at = now()
  where code = p_riga.code;

  return jsonb_build_object('device_id', v_device.id, 'name', v_device.name);
end;
$$;

revoke all on function public._claim_pairing_row(public.pairing_codes, uuid)
  from anon, public, authenticated;

-- Invariata nel comportamento: solo il corpo se n'e' andato.
create or replace function public.claim_pairing_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_riga public.pairing_codes;
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

  return public._claim_pairing_row(v_riga, v_uid);
end;
$$;

revoke all on function public.claim_pairing_code(text) from anon, public;
grant execute on function public.claim_pairing_code(text) to authenticated;

-- Reclamo per consenso: tre controlli, e servono tutti e tre.
create or replace function public.claim_pairing_by_consent(
  p_install_id uuid,
  p_device_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_riga public.pairing_codes;
begin
  if v_uid is null then
    raise exception 'non autenticato' using errcode = '28000';
  end if;

  -- Il device_id viaggia in chiaro sulla rete locale: da solo non e' una prova.
  -- Chi reclama deve essere membro di quel telefono. Senza questo controllo,
  -- chi intercettasse il device_id potrebbe reclamare al posto del proprietario.
  if not exists (
    select 1 from public.device_members
    where device_id = p_device_id and user_id = v_uid
  ) then
    raise exception 'consenso non valido' using errcode = 'P0002';
  end if;

  select * into v_riga
  from public.pairing_codes
  where install_id = p_install_id
    and consent_device_id = p_device_id
    and expires_at > now()
  for update;

  if not found then
    raise exception 'consenso non valido' using errcode = 'P0002';
  end if;

  return public._claim_pairing_row(v_riga, v_uid);
end;
$$;

revoke all on function public.claim_pairing_by_consent(uuid, uuid) from anon, public;
grant execute on function public.claim_pairing_by_consent(uuid, uuid) to authenticated;
