import type { NextRequest } from "next/server";
import { formaDiLancio } from "@/lib/devices/launch";
import { resolveProviderLink } from "@/lib/links/resolve";
import { createClient } from "@/lib/supabase/server";
import { getTitleCached } from "@/lib/tmdb/get-title";
import { isIntInRange, isMediaType, isTmdbId } from "@/lib/validate";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import type { LaunchPlan } from "@/lib/tv/dto";

/** Oltre due minuti il comando non ha piu' senso (spec ZConnection §6). */
const COMANDO_TTL_MS = 2 * 60 * 1000;

/**
 * La TV chiede come aprire un titolo su una piattaforma e, nello stesso gesto,
 * **dichiara** che sta per guardarlo: la riga di `device_commands` nasce gia'
 * consegnata (`delivered_at = now()`), perche' qui non c'e' nessuna coda da
 * sondare — e' la TV stessa a chiedere. Da questo momento gli eventi senza titolo
 * di quella TV valgono come questo titolo (`src/lib/scrobble/declared.ts`).
 */
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !b ||
    !isTmdbId(b.titleId) ||
    !isMediaType(b.mediaType) ||
    !isIntInRange(b.providerId, 1, 999999)
  ) {
    return tvJson({ error: "Richiesta non valida" }, { status: 400 });
  }
  const titleId = b.titleId;
  const mediaType = b.mediaType;
  const providerId = b.providerId;

  return withBearer(request, async (ctx) => {
    const cached = await getTitleCached(titleId, mediaType, false);
    if (!cached) return tvJson({ error: "Titolo non trovato" }, { status: 404 });

    const link = await resolveProviderLink(cached.title, providerId).catch(() => null);
    const forma = formaDiLancio(providerId, link?.url ?? null);
    if (!forma) {
      return tvJson(
        { error: "Questa piattaforma non si apre dalla TV" },
        { status: 409 },
      );
    }

    const supabase = await createClient();
    const adesso = new Date();
    const { data: riga, error } = await supabase
      .from("device_commands")
      .insert({
        device_id: ctx.deviceId,
        created_by: ctx.userId,
        title_id: titleId,
        media_type: mediaType,
        provider_id: providerId,
        packages: forma.packages,
        data_uri: forma.dataUri,
        extra_deeplink: forma.extraDeeplink,
        esito_atteso: forma.esito,
        expires_at: new Date(adesso.getTime() + COMANDO_TTL_MS).toISOString(),
        delivered_at: adesso.toISOString(),
      })
      .select("id")
      .single();
    if (error || !riga) {
      console.error("[tv] play: insert", error?.code);
      return tvJson({ error: "Non è riuscito, riprova." }, { status: 500 });
    }

    const piano: LaunchPlan = {
      commandId: riga.id,
      android: {
        packages: forma.packages,
        dataUri: forma.dataUri,
        extraDeeplink: forma.extraDeeplink,
      },
      tvos: null,
      expected: forma.esito,
    };
    return tvJson(piano);
  });
}

export const dynamic = "force-dynamic";
