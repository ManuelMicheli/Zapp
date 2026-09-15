"use server";

import { createClient } from "@/lib/supabase/server";
import { getSeedGridForAge } from "@/lib/taste/seed-source";
import { ETA_MINIMA } from "@/lib/legal/versions";
import type { SeedCandidate } from "@/lib/taste/seed";

/**
 * La griglia del passo 2, rifatta su misura dell'anno di nascita appena inserito.
 *
 * L'anno si conosce solo al passo 1, quando la pagina è già stata resa: invece di far
 * aspettare tutti, il passo 2 si apre con la griglia di base e questa azione la
 * sostituisce quando arriva. Se qualcosa va storto torna un elenco vuoto e il form
 * tiene quella che ha già — nessuno resta fuori dall'iscrizione per una griglia.
 *
 * Non scrive niente: è una lettura, e l'anno vero lo verifica comunque
 * `completeOnboarding` prima di salvarlo.
 */
export async function caricaSeedPerEta(birthYear: number): Promise<SeedCandidate[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const annoCorrente = new Date().getFullYear();
  if (
    !Number.isInteger(birthYear) ||
    birthYear < 1900 ||
    annoCorrente - birthYear < ETA_MINIMA
  ) {
    return [];
  }

  try {
    return await getSeedGridForAge(birthYear);
  } catch (error) {
    console.error("[onboarding] griglia per età non calcolata:", error);
    return [];
  }
}
