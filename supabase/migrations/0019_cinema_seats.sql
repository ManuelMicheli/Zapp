-- Posti letti dal biglietto (o scritti a mano): l'ultima schermata della modalità
-- "Sono qui" dice dove sedersi, quando il QR è già stato scansionato all'ingresso.
alter table public.cinema_plans
  add column if not exists seats text[] not null default '{}',
  add column if not exists hall text;

comment on column public.cinema_plans.seats is
  'Posti del biglietto, es. {"Fila G, Posto 12"}: dal testo del PDF o scritti dall''utente.';
comment on column public.cinema_plans.hall is 'Sala indicata sul biglietto, es. "Sala 5".';
