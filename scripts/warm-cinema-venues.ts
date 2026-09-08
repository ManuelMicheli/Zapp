/**
 * Catalogo nazionale delle sale: percorre le pagine pubbliche MyMovies (elenco
 * province → pagina del capoluogo + indice di provincia) e riempie `cinema_venues`
 * con nome, comune, indirizzo e coordinate.
 *
 * Serve perché il raggio di 25 km scavalca quasi sempre un confine di provincia,
 * mentre gli elenchi MyMovies sono per provincia: con la tabella piena, "i cinema
 * vicino a te" li trova comunque (vedi `nearbyKnownVenues`).
 *
 * Uso: pnpm tsx --env-file=.env.local scripts/warm-cinema-venues.ts [slug provincia…]
 *
 * Lento di proposito (una richiesta ogni 700 ms): MyMovies risponde 403 all'IP che
 * insiste, e il blocco spegne la sezione cinema per tutti.
 */
import { createClient } from "@supabase/supabase-js";
import {
  capitalSlug,
  parseCityIndex,
  parseMappa,
  parseProvinceIndex,
  parseProvinceList,
  provinceFromPath,
  type MmCinemaRef,
} from "../src/lib/cinema/mymovies/parse";

const MM = "https://www.mymovies.it";
const UA = `Zapp/1.0 (+${process.env.NEXT_PUBLIC_APP_URL ?? "https://zapp-mu.vercel.app"})`;
const DELAY_MS = 700;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let blocked = false;

async function get(path: string): Promise<string | null> {
  await sleep(DELAY_MS);
  try {
    const res = await fetch(`${MM}${path}`, {
      headers: { "User-Agent": UA, "Accept-Language": "it" },
    });
    if (res.status === 403) {
      blocked = true;
      console.error(`403 su ${path}: MyMovies ha bloccato l'IP, mi fermo`);
      return null;
    }
    if (!res.ok) {
      console.error(`${res.status} su ${path}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.error(`errore su ${path}:`, e);
    return null;
  }
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const only = new Set(process.argv.slice(2));
  const hub = await get("/cinema/");
  if (!hub) throw new Error("elenco province non raggiungibile");
  const provinces = parseProvinceList(hub).filter(
    (p) => only.size === 0 || only.has(p.slug),
  );
  console.log(`province da percorrere: ${provinces.length}`);

  const { data: existing } = await db.from("cinema_venues").select("mymovies_id, lat");
  const known = new Map((existing ?? []).map((r) => [r.mymovies_id, r.lat]));
  let nuovi = 0;
  let aggiornati = 0;

  for (const p of provinces) {
    if (blocked) break;
    const capital = capitalSlug(p.slug);
    const refs = new Map<number, MmCinemaRef>();

    const cityHtml = await get(`/cinema/${p.slug}/${capital}/`);
    for (const ref of cityHtml ? parseCityIndex(cityHtml) : []) refs.set(ref.id, ref);

    let indexHtml = await get(`/cinema/${p.slug}/provincia/`);
    let fromIndex = indexHtml ? parseProvinceIndex(indexHtml) : [];
    if (fromIndex.length === 0 && capital !== p.slug) {
      indexHtml = await get(`/cinema/${capital}/provincia/`);
      fromIndex = indexHtml ? parseProvinceIndex(indexHtml) : [];
    }
    for (const ref of fromIndex) if (!refs.has(ref.id)) refs.set(ref.id, ref);

    // le coordinate si chiedono solo per chi non le ha già
    const rows = [];
    for (const ref of refs.values()) {
      if (blocked) break;
      if (known.get(ref.id) != null) continue;
      const mappa = await get(`/ajax/mappe/mappa.asp?sala=${ref.id}`);
      const m = mappa ? parseMappa(mappa) : null;
      rows.push({
        mymovies_id: ref.id,
        province_slug: provinceFromPath(ref.path) ?? p.slug,
        path: ref.path,
        name: ref.name,
        town: m?.town || ref.town,
        address: m?.address ?? null,
        lat: m?.lat ?? null,
        lng: m?.lng ?? null,
        fetched_at: new Date().toISOString(),
      });
    }

    if (rows.length > 0) {
      const { error } = await db
        .from("cinema_venues")
        .upsert(rows, { onConflict: "mymovies_id" });
      if (error) console.error(`upsert ${p.slug}:`, error.message);
      else {
        nuovi += rows.filter((r) => !known.has(r.mymovies_id)).length;
        aggiornati += rows.length;
        for (const r of rows) known.set(r.mymovies_id, r.lat);
      }
    }
    console.log(
      `${p.slug.padEnd(20)} sale=${String(refs.size).padStart(3)} scritte=${rows.length}`,
    );
  }

  const { count } = await db
    .from("cinema_venues")
    .select("mymovies_id", { count: "exact", head: true })
    .not("lat", "is", null);
  console.log(
    `\nnuove ${nuovi}, scritte ${aggiornati}. In tabella con coordinate: ${count ?? "?"}`,
  );
  if (blocked) {
    console.log("interrotto dal 403: rilancialo più tardi, riparte da dove serve");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
