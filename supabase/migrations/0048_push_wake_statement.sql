-- Il risveglio del job push va per istruzione, non per riga: un insert massivo
-- (bench_scale, notifiche DSA) accodava una chiamata http per ogni riga.
-- La funzione non legge NEW e ritorna null: e' gia' compatibile.
drop trigger if exists notifications_push_wake on public.notifications;
create trigger notifications_push_wake
  after insert on public.notifications
  for each statement execute function public.notifications_push_wake();
