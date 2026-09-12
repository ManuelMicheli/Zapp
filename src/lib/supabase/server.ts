import "server-only";

import { createServerClient } from "@supabase/ssr";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { bearerContext } from "./request-session";

/**
 * Client legato a un access token portato in header (app TV). RLS attiva come col
 * cookie: PostgREST legge `auth.uid()` dal JWT. Niente storage, niente refresh: il
 * rinnovo lo fa la TV con `/api/tv/v1/auth/refresh`.
 */
export function createBearerClient(accessToken: string): SupabaseClient<Database> {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}

/** Client Supabase legato alla sessione dell'utente (RLS attiva). */
export async function createClient(): Promise<SupabaseClient<Database>> {
  const bearer = bearerContext();
  if (bearer) return createBearerClient(bearer.accessToken);

  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // chiamato da un Server Component: il refresh dei cookie
            // è gestito dal middleware
          }
        },
      },
    },
  );
}

/**
 * Client con service role: bypassa RLS. Solo per scritture di sistema
 * (cache titoli TMDB). Mai esporre al client, mai usare per dati utente.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.startsWith("INSERISCI")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY mancante in .env.local");
  }
  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
