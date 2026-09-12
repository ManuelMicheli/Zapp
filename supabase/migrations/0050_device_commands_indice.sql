-- Indice per "titoloDichiarato()" (Task 6): trova la dichiarazione piu' recente
-- per device+provider a ogni battito di scrobble (ogni 30 s per sessione
-- attiva), con `.eq("device_id", …).eq("provider_id", …).not("delivered_at",
-- "is", null).order("delivered_at", {ascending:false}).limit(1)`. Le righe di
-- device_commands non si cancellano mai (la tabella e' anche l'archivio delle
-- dichiarazioni), quindi senza un indice dedicato quella query e' col tempo un
-- sort su tutte le righe del dispositivo.
create index device_commands_dichiarazione_idx
  on public.device_commands (device_id, provider_id, delivered_at desc)
  where delivered_at is not null;

-- Nota su device_commands_da_consegnare_idx (0046): e' su (device_id,
-- expires_at) ma il ritiro dalla TV cerca il comando "piu' recente", che e'
-- semantica di created_at. Funziona solo perche' expires_at e' calcolato con
-- un TTL fisso da created_at, quindi le due colonne sono monotone insieme:
-- chi cambia il TTL (o lo rende variabile) rompe questo accoppiamento
-- implicito e deve rivedere l'indice.
