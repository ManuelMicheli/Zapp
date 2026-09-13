import { type NextRequest, NextResponse } from "next/server";
import { CODICE_TTL_MS, generaCodice } from "@/lib/devices/pairing";
import { rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";

const PIATTAFORME = ["fire_tv", "android_tv", "android", "tvos"] as const;
type Piattaforma = (typeof PIATTAFORME)[number];

function isPiattaforma(valore: unknown): valore is Piattaforma {
  return (
    typeof valore === "string" && (PIATTAFORME as readonly string[]).includes(valore)
  );
}

/**
 * La TV si presenta e riceve un codice da mostrare a schermo.
 *
 * Il token lo genera la TV: qui arriva solo il suo hash, e **non torna mai
 * indietro** nulla che permetta di ricostruirlo.
 */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  if (!corpo || typeof corpo !== "object") {
    return NextResponse.json({ error: "richiesta non valida" }, { status: 400 });
  }

  const { install_id: installId, token_hash: tokenHash, name, platform } = corpo;
  const validi =
    typeof installId === "string" &&
    /^[0-9a-f-]{36}$/i.test(installId) &&
    typeof tokenHash === "string" &&
    /^[0-9a-f]{64}$/.test(tokenHash) &&
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 60 &&
    isPiattaforma(platform);

  if (!validi) {
    return NextResponse.json({ error: "richiesta non valida" }, { status: 400 });
  }

  // Per installazione: una TV che riparte in ciclo non deve poter riempire la
  // tabella.
  if (!(await rateLimit(`pair:${installId}`, 10, 600, { condiviso: true }))) {
    return NextResponse.json({ error: "troppe richieste" }, { status: 429 });
  }

  // **E anche per indirizzo.** Il tetto qui sopra e' per `install_id`, che lo
  // sceglie il chiamante: bastava un UUID nuovo a ogni richiesta per non
  // incontrarlo mai. Questa e' l'unica rotta che scrive senza sessione, quindi
  // e' l'unica dove quel giro costa righe in tabella. Trenta in dieci minuti
  // stanno larghe per una casa (una TV ne chiede una ogni dieci minuti, e chi
  // ha piu' televisori condivide l'indirizzo), e chiudono il giro.
  const indirizzo = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (
    indirizzo &&
    !(await rateLimit(`pair-ip:${indirizzo}`, 30, 600, { condiviso: true }))
  ) {
    return NextResponse.json({ error: "troppe richieste" }, { status: 429 });
  }

  const service = createServiceClient();

  // I codici scaduti non li cancellava nessuno: si toglievano solo quando la
  // stessa installazione ne chiedeva un altro o quando la TV leggeva il suo
  // reclamo. Un codice mai usato restava per sempre. Si spazza qui, dove la
  // tabella si tocca comunque e l'indice su `expires_at` c'e' gia'.
  await service.from("pairing_codes").delete().lt("expires_at", new Date().toISOString());
  await service.from("pairing_codes").delete().eq("install_id", installId);

  const scadenza = new Date(Date.now() + CODICE_TTL_MS).toISOString();
  for (let tentativo = 0; tentativo < 5; tentativo += 1) {
    const code = generaCodice();
    const { error } = await service.from("pairing_codes").insert({
      code,
      install_id: installId,
      token_hash: tokenHash,
      name,
      platform,
      expires_at: scadenza,
    });
    if (!error) return NextResponse.json({ code, expires_at: scadenza });
    if (error.code !== "23505") {
      console.error("pair: insert fallita", error);
      return NextResponse.json({ error: "errore interno" }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "errore interno" }, { status: 500 });
}

export const dynamic = "force-dynamic";
