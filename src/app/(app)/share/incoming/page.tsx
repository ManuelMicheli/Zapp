import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { rateLimit } from "@/lib/rate-limit";
import { parseShared, textQuery } from "@/lib/share/parse-shared";
import { resolveShared } from "@/lib/share/resolve";
import { SharePicker, ShareNotFound, ShareLimit } from "./SharePicker";

/**
 * Dove atterra una condivisione da un'altra app: il guscio nativo (o il foglio
 * "Condividi" del telefono) manda qui l'URL e il testo, e da qui si esce quasi
 * sempre subito sulla scheda del titolo. La pagina si vede solo quando c'e' da
 * chiedere qualcosa — "quale intendevi?" — o quando non si e' riconosciuto
 * niente.
 *
 * `force-dynamic`: gli argomenti arrivano dalla query string e la risposta
 * dipende da chi ha fatto accesso; qui non c'e' niente da rendere in anticipo.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Condividi in Zapp" };

/**
 * Gli input vengono da fuori: un'app puo' incollare nel testo mezzo articolo.
 * Il parser lavora comunque su una query da 120 caratteri, ma qui si taglia
 * prima, cosi' nessuna espressione regolare gira su un megabyte.
 */
const MAX_INPUT = 2000;

/** Un parametro ripetuto (`?url=a&url=b`) arriva come array: non e' un input valido. */
function primo(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_INPUT);
  return trimmed.length > 0 ? trimmed : undefined;
}

export default async function ShareIncomingPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; text?: string }>;
}) {
  const params = await searchParams;
  const url = primo(params.url);
  const text = primo(params.text);

  // Il layout di `(app)` ha gia' rimandato al login chi non ce l'ha: il viewer
  // serve per avere una chiave di limite per persona, non per il controllo.
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  // Ogni condivisione puo' costare una ricerca TMDB: il conto e' condiviso fra
  // le istanze, come per tutte le chiamate a servizi di terzi.
  const consentito = await rateLimit(`share:${viewer.id}`, 30, 60, { condiviso: true });
  if (!consentito) return <ShareLimit />;

  const target = parseShared({ url, text });
  const dalTesto = text ? (textQuery(text) ?? undefined) : undefined;
  if (!target) return <ShareNotFound query={dalTesto?.query ?? null} />;

  const resolution = await resolveShared(target, dalTesto);
  if (resolution.status === "found") {
    // `?from=share` apre il menu "Aggiungi" sulla scheda: chi condivide un
    // titolo quasi sempre lo vuole mettere da qualche parte.
    redirect(`/title/${resolution.mediaType}/${resolution.id}?from=share`);
  }
  if (resolution.status === "choose") {
    return <SharePicker query={resolution.query} options={resolution.options} />;
  }
  return <ShareNotFound query={resolution.query} />;
}
