import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validate";
import { rateLimit } from "@/lib/rate-limit";

/**
 * La TV chiede se c'e' qualcosa da aprire.
 *
 * Restituisce **al massimo un comando** e lo segna consegnato nello stesso
 * momento: per "fai partire un film", non partire e' meglio che partire due
 * volte. Un comando scaduto non si consegna mai — una TV accesa un'ora dopo il
 * lancio non deve mettersi a riprodurre da sola.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token.length < 20) {
    return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");

  // Un sondaggio ogni 2 s sono 30 al minuto (piu' quello immediato dopo un
  // comando eseguito, per riferirne l'esito senza aspettare): il tetto lascia
  // spazio a un riavvio e taglia un'app impazzita.
  if (!(await rateLimit(`comandi:${tokenHash}`, 80, 60))) {
    return NextResponse.json({ error: "troppe richieste" }, { status: 429 });
  }

  // **E anche per indirizzo.** Il tetto qui sopra e' per token, ma la sua
  // chiave la sceglie chi chiama, prima ancora che sia verificata contro il
  // database: un token finto nuovo a ogni richiesta apre un secchio nuovo e
  // non incontra mai quel tetto, anche se ogni richiesta costa comunque una
  // query. L'indirizzo invece non si sceglie. Trenta sondaggi al minuto per
  // TV: 240 al minuto per indirizzo stanno larghe anche per una casa con piu'
  // televisori, e chiudono il giro a chi enumera token.
  //
  // **In memoria, non condiviso**, ed e' una scelta contro il solito consiglio.
  // Questa e' l'unica rotta che viene chiamata da sola tutto il tempo: 30
  // sondaggi al minuto per televisore acceso sono ~43.000 richieste al giorno,
  // e con un contatore condiviso diventano ~86.000 comandi Upstash al giorno
  // **per apparecchio** — il piano gratuito (500.000 al mese) se ne va in meno
  // di una settimana con un solo televisore. Quando finisce, `upstashLimit`
  // ripiega in silenzio sulla memoria e a degradare non e' questo tetto: sono
  // *tutti* i tetti condivisi dell'app, compresi quelli dell'abbinamento. Qui
  // per istanza basta: serve a fermare un ciclo impazzito, non a difendere una
  // risorsa di terzi.
  const indirizzo = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (indirizzo && !(await rateLimit(`comandi-ip:${indirizzo}`, 240, 60))) {
    return NextResponse.json({ error: "troppe richieste" }, { status: 429 });
  }

  const service = createServiceClient();
  const { data: device, error: deviceError } = await service
    .from("devices")
    .select("id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();
  if (deviceError) console.error("[tv] lettura dispositivo fallita", deviceError);
  if (!device) return NextResponse.json({ error: "non autorizzato" }, { status: 401 });

  // L'esito del comando precedente, se la TV ce l'ha mandato.
  const esito = new URL(request.url).searchParams.get("esito");
  if (esito) {
    const [id, valore] = esito.split(":");
    if (isUuid(id) && ["ok", "assente", "errore"].includes(valore)) {
      const { error: esitoError } = await service
        .from("device_commands")
        .update({ result: valore })
        .eq("id", id)
        .eq("device_id", device.id);
      if (esitoError) console.error("[tv] aggiornamento esito fallito", esitoError);
    }
  }

  const { data: comando, error: comandoError } = await service
    .from("device_commands")
    .select("id, packages, data_uri, extra_deeplink")
    .eq("device_id", device.id)
    .is("delivered_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (comandoError) console.error("[tv] lettura comando fallita", comandoError);

  if (!comando) return NextResponse.json({ command: null });

  // Confronta-e-imposta, non lettura-poi-scrittura: fra la SELECT sopra e
  // questa UPDATE due sondaggi possono essere in volo insieme (un ritentativo
  // di rete, una guardia anti-doppio-avvio che si rompe) e vedere entrambi lo
  // stesso comando "non ancora consegnato". Se qui si scrivesse senza
  // ricontrollare `delivered_at`, vincerebbero entrambe le richieste e il
  // comando partirebbe due volte. Il filtro `is("delivered_at", null)` fa
  // valutare la condizione al database dentro la stessa scrittura: solo la
  // richiesta che arriva per prima tocca la riga (`consegnato` non nullo), la
  // seconda non tocca nulla e riceve `command: null` come se non ci fosse
  // niente da consegnare — esattamente cio' che deve succedere. Si ripete
  // anche il filtro sulla scadenza, che altrimenti varrebbe solo per la
  // lettura sopra e lascerebbe consegnare, per una finestra di millisecondi,
  // un comando scaduto proprio ora.
  const { data: consegnato, error: consegnaError } = await service
    .from("device_commands")
    .update({ delivered_at: new Date().toISOString() })
    .eq("id", comando.id)
    .is("delivered_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id, packages, data_uri, extra_deeplink")
    .maybeSingle();
  if (consegnaError) console.error("[tv] consegna comando fallita", consegnaError);

  if (!consegnato) return NextResponse.json({ command: null });

  return NextResponse.json({ command: consegnato });
}

export const dynamic = "force-dynamic";
