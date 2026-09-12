import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validate";
import { appOrigin } from "@/lib/app-origin";

/**
 * Ritorno dal link via email (conferma iscrizione, recupero password).
 *
 * Due accortezze sul redirect, che qui e' uno dei due punti in cui un parametro
 * dell'URL decide dove va il browser (l'altro e' `/share/recommendation`):
 * - `next` viene ripulito: deve essere un percorso interno. `//evil.example` e
 *   `/\evil.example` per il browser sono indirizzi assoluti, non percorsi.
 * - la base e' `NEXT_PUBLIC_APP_URL` quando c'e', non l'`origin` ricavato dalla
 *   richiesta: quello nasce dall'header `Host`, che chi chiama puo' scrivere
 *   (`appOrigin`, condivisa con l'altra rotta).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = appOrigin(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
