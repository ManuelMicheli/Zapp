-- Un comando alla TV lo scrive **solo il server**, mai il browser.
--
-- Fino a qui la riga la inseriva il client dell'utente, protetto da una policy
-- che verificava `created_by = auth.uid()` e l'appartenenza al dispositivo. Il
-- controllo di **chi** inserisce era giusto; quello di **cosa** inserisce non
-- c'era affatto: `packages`, `data_uri`, `extra_deeplink` ed `expires_at` non
-- hanno vincoli, e PostgREST espone la tabella come qualunque altra. Chiunque
-- abbia la sessione poteva scrivere a mano su `/rest/v1/device_commands` e
-- saltare del tutto `formaDiLancio` — cioe' proprio la funzione che esiste
-- perche' quella riga diventa un intent che **un'altra macchina esegue**.
--
-- Cosa ci si poteva fare, concretamente: mandare a un televisore di casa un
-- ACTION_VIEW verso un pacchetto e un URI a piacere; scrivere una scadenza
-- lunga quanto si vuole, rompendo l'invariante che una TV accesa un'ora dopo
-- non si metta a riprodurre da sola; e soprattutto **forgiare una
-- dichiarazione** per un `title_id` qualsiasi, che e' il modo per far comparire
-- in libreria — anche agli altri membri del dispositivo — una visione mai
-- avvenuta.
--
-- Ora l'insert lo fa il service client dentro `lanciaSullaTv`, che i controlli
-- li ha gia' tutti (sessione, appartenenza, tetto di frequenza, forma del
-- lancio). Al client resta la sola lettura, che serve al bottone per sapere
-- com'e' andata.
drop policy if exists device_commands_insert_own on public.device_commands;

revoke insert, update, delete on public.device_commands from authenticated;

-- Igiene, come nelle altre tabelle dei dispositivi (0033, 0045): anonimo non ha
-- niente da fare qui. Oggi la RLS gia' copre; questa riga toglie il dubbio.
revoke all on public.device_commands from anon;
