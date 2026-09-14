-- Vincoli di lunghezza e di dominio su favorite_people (migration 0054), mancanti
-- nella prima versione: la policy di insert controlla solo la proprieta' della
-- riga (user_id), non il contenuto. `name` e `profile_path` arrivano da TMDB e un
-- client autenticato puo' scrivere direttamente via PostgREST senza passare dalla
-- UI. Convenzione del progetto (search_history 0024, favorite_characters 0053):
-- ogni colonna di testo e ogni id TMDB hanno un check esplicito.

alter table public.favorite_people
  add constraint favorite_people_name_check
  check (char_length(name) between 1 and 200);

alter table public.favorite_people
  add constraint favorite_people_profile_path_check
  check (profile_path is null or char_length(profile_path) <= 200);

alter table public.favorite_people
  add constraint favorite_people_person_id_check
  check (person_id > 0);
