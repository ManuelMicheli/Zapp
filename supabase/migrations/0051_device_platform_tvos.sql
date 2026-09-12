-- Apple TV: stessa tabella devices, stesso abbinamento. Nessun ascolto (tvOS non
-- espone le sessioni di altre app), quindi nessuna colonna in piu'.
alter type public.device_platform add value if not exists 'tvos';
