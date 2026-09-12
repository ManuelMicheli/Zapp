import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Epoch in secondi, come lo da' Supabase. */
  expiresAt: number;
}

function anonClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}

function daSupabase(s: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}): Session {
  return {
    accessToken: s.access_token,
    refreshToken: s.refresh_token,
    expiresAt: s.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  };
}

/**
 * Una sessione Supabase vera per la TV, senza password e senza mail: si genera un
 * magic link con il service role (`generateLink` non lo spedisce) e lo si consuma
 * subito con un client anonimo (`verifyOtp`). Il link non esce mai da questa
 * funzione. Si chiama solo dal poll dell'abbinamento, dopo che il telefono ha
 * reclamato il codice e la TV si e' autenticata col proprio token.
 */
export async function coniaSessione(userId: string): Promise<Session | null> {
  const admin = createServiceClient();
  const { data: utente, error: errUtente } = await admin.auth.admin.getUserById(userId);
  const email = utente?.user?.email;
  if (errUtente || !email) {
    console.error("[tv] coniaSessione: utente senza email", errUtente?.code);
    return null;
  }

  const { data: link, error: errLink } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (errLink || !tokenHash) {
    console.error("[tv] coniaSessione: generateLink", errLink?.code);
    return null;
  }

  const { data, error } = await anonClient().auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (error || !data.session) {
    console.error("[tv] coniaSessione: verifyOtp", error?.code);
    return null;
  }
  return daSupabase(data.session);
}

/** Rinnovo: il refresh token e' monouso, la TV sostituisce entrambi i token. */
export async function rinnovaSessione(refreshToken: string): Promise<Session | null> {
  const { data, error } = await anonClient().auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (error || !data.session) return null;
  return daSupabase(data.session);
}

/** Chiude la sessione di quel solo token (la TV), non le altre dell'utente. */
export async function chiudiSessione(accessToken: string): Promise<void> {
  const { error } = await createServiceClient().auth.admin.signOut(accessToken, "local");
  if (error) console.error("[tv] chiudiSessione", error.code);
}
