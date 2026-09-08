/**
 * Colori dominanti di un'immagine: matematica pura (nessun `server-only`, nessuna
 * `fetch`), così le regole si possono provare con Vitest. La lettura della locandina e
 * la cache stanno in `palette.ts`.
 *
 * L'idea, in una riga: **la sfumatura deve avere le stesse proporzioni della
 * locandina**. Non "qual è il colore più interessante", ma "di che cosa è fatta
 * quest'immagine": se *Sin City* è per tre quarti grigio ardesia e per un pezzetto
 * rossa, la pagina dev'essere grigia con un po' di rosso, non rossa. Per questo grigi e
 * bianchi non sono scarti da ignorare: sono candidati come gli altri, e vincono quando
 * occupano più spazio.
 */

/** Colori dominanti di una locandina, come `[r, g, b]` 0–255. */
export interface Palette {
  /** La tinta di cui la locandina è più fatta: può benissimo essere un grigio. */
  primary: [number, number, number];
  /** L'altra tinta: il colore di un bianco e nero, il grigio di una locandina colorata. */
  secondary: [number, number, number];
  /**
   * Quanto pesa la seconda tinta rispetto alla prima (0,55–1), com'è sulla locandina:
   * il cappotto rosso di *Schindler's List* si vede, ma non tinge la pagina.
   */
  secondaryWeight: number;
  /**
   * Quanta locandina non è nera, da 0,5 a 1: moltiplica tutti i veli. Un manifesto quasi
   * tutto nero (*The Artist*) lascia la pagina scura; una tavola piena da bordo a bordo
   * (*Barbie*) la accende.
   */
  intensity: number;
  /** `true` quando la tinta principale è un grigio: la locandina è in bianco e nero. */
  neutral: boolean;
}

/** Tinta di ripiego quando non c'è proprio nulla da misurare (immagine assente). */
export const FALLBACK: Palette = {
  primary: [92, 70, 140],
  secondary: [50, 44, 80],
  secondaryWeight: 1,
  intensity: 1,
  neutral: false,
};

/** Da qui in su un pixel è un colore; sotto è un grigio, magari con un sottotono. */
const COLOR_SAT_MIN = 0.35;
/** Un colore quasi bianco (una pastellata slavata) conta come chiaro, non come tinta. */
const COLOR_LIGHT_MAX = 0.9;
/** Un colore attira l'occhio più di un grigio della stessa estensione. */
const COLOR_PULL = 1.5;
/** La seconda tinta deve pesare almeno così rispetto alla prima, o è un caso isolato. */
const SECONDARY_SHARE_MIN = 0.12;
/**
 * Il colore di una locandina in bianco e nero basta molto meno: una macchia rossa in un
 * mare di grigi si vede eccome (il cappotto di *Schindler's List* è l'1% dei pixel).
 */
const ACCENT_SHARE_MIN = 0.03;
/**
 * E un dettaglio *vivo* basta ancora meno: se il colore è pieno (chroma alta) e occupa
 * almeno qualche pixel su mille, va in pagina lo stesso. È il cappotto rosso di
 * *Schindler's List*: mezzo punto percentuale di locandina, ma è la cosa che si ricorda.
 * Il rumore JPEG di una stampa in bianco e nero ha chroma bassissima e resta fuori.
 */
const ACCENT_CHROMA_MIN = 0.3;
const ACCENT_PIXELS_MIN = 0.003;
/** Distanza di tonalità perché due tinte siano davvero diverse. */
const SECONDARY_HUE_MIN = 40;
/** Entro questa distanza di tonalità due celle sono lo stesso colore della locandina. */
const FAMILY_HUE = 30;
/** Quanto conta un pixel di incarnato: i volti riempiono le locandine ma non le colorano. */
const SKIN_WEIGHT = 0.3;
/** Fra celle della stessa famiglia che pesano almeno metà della prima, vince la più viva. */
const REP_TIE = 0.5;
/** Fascia di luminosità del grigio in pagina: mai nero pieno, mai bianco pieno. */
const GRAY_L_MIN = 0.3;
const GRAY_L_MAX = 0.62;
/** Veli minimi e massimi: nemmeno la locandina più scura lascia la pagina nera. */
const INTENSITY_MIN = 0.5;
const INTENSITY_MAX = 1;

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => Math.round((v + m) * 255)) as [number, number, number];
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * Porta una tinta in una fascia adatta a un bagliore su nero, **restando vicina
 * all'originale**: si corregge solo chi è troppo spento o troppo chiaro per farsi
 * vedere, non si riporta ogni locandina allo stesso colore acceso.
 */
export function tame(rgb: [number, number, number]): [number, number, number] {
  const [h, s, l] = rgbToHsl(...rgb);
  return hslToRgb(h, clamp(s, 0.25, 0.85), clamp(l, 0.26, 0.52));
}

/** Grigio con lo stesso sottotono dell'immagine, alla luminosità chiesta. */
function toNeutral(rgb: [number, number, number], l: number): [number, number, number] {
  const [h, s] = rgbToHsl(...rgb);
  return hslToRgb(h, Math.min(s, 0.1), l);
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Incarnato: arancione spento a media luminosità. Le facce occupano metà locandina e
 * senza questo freno ogni scheda finirebbe con lo stesso alone beige, invece del blu o
 * del rosso che si vede guardandola. Un arancione davvero acceso (un tramonto, il
 * fondale di *Blade Runner 2049*) resta pieno: è più saturo di qualunque pelle.
 */
function isSkin(h: number, s: number, l: number): boolean {
  return h >= 10 && h <= 40 && s < 0.55 && l >= 0.28 && l <= 0.8;
}

interface Bucket {
  /** Quanto quella cella "occupa" la locandina: somma delle luminosità dei suoi pixel. */
  presence: number;
  count: number;
  /** Vivacità vera (max−min dei canali): a differenza della saturazione cala col buio. */
  chroma: number;
  r: number;
  g: number;
  b: number;
  hue: number;
}

interface Analysis {
  /** Celle di colore, dalla più presente alla meno. */
  buckets: Bucket[];
  /** Peso dei grigi (bianchi compresi): il "non colore" della locandina. */
  grayPresence: number;
  /** Grigio da mettere in pagina, col sottotono e la luminosità della locandina. */
  gray: [number, number, number] | null;
  /** Quota di locandina che non è nera: quanto è "piena" l'immagine. */
  bodyShare: number;
  /** Pixel non neri: il "corpo" della locandina, in pixel. */
  visible: number;
}

/**
 * Un passaggio solo sui pixel. Ogni pixel non nero finisce da una parte sola: nei grigi
 * (compresi bianchi e pastellate slavate) o in una cella di colore. Il peso non è il
 * numero di pixel ma la somma delle loro luminosità: su fondo nero un grigio scuro si
 * vede pochissimo, un bianco tantissimo.
 */
function analyze(pixels: Uint8Array | Buffer, channels: number): Analysis {
  const buckets = new Map<string, Bucket>();
  let visible = 0;
  let grayPresence = 0;
  let grayCount = 0;
  let grayLight = 0;
  let gr = 0;
  let gg = 0;
  let gb = 0;

  for (let i = 0; i + 2 < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);
    if (l < 0.08) continue;
    visible += 1;

    if (s < COLOR_SAT_MIN || l > COLOR_LIGHT_MAX) {
      // Grigio: pesa (e tinge la media) in proporzione a quanto è chiaro, così il bianco
      // di fondo di *Arcane* conta e il nero sporco di *Sin City* quasi no.
      grayPresence += l;
      grayCount += 1;
      grayLight += l * l;
      gr += r * l;
      gg += g * l;
      gb += b * l;
      continue;
    }

    const key = `${Math.floor(h / 24)}-${Math.floor(s * 4)}-${Math.floor(l * 4)}`;
    const bucket = buckets.get(key) ?? {
      presence: 0,
      count: 0,
      chroma: 0,
      r: 0,
      g: 0,
      b: 0,
      hue: 0,
    };
    bucket.presence += l * COLOR_PULL * (isSkin(h, s, l) ? SKIN_WEIGHT : 1);
    bucket.count += 1;
    bucket.chroma += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.hue += h;
    buckets.set(key, bucket);
  }

  const total = Math.floor(pixels.length / channels);
  return {
    buckets: [...buckets.values()].sort((a, b) => b.presence - a.presence),
    grayPresence,
    gray:
      grayCount === 0
        ? null
        : toNeutral(
            [gr / grayPresence, gg / grayPresence, gb / grayPresence],
            clamp(grayLight / grayPresence, GRAY_L_MIN, GRAY_L_MAX),
          ),
    bodyShare: total === 0 ? 0 : visible / total,
    visible,
  };
}

function bucketRgb(k: Bucket): [number, number, number] {
  return [
    Math.round(k.r / k.count),
    Math.round(k.g / k.count),
    Math.round(k.b / k.count),
  ];
}

/**
 * Le tinte della locandina *con tutte le loro sfumature*. Il rosso di un titolo finisce
 * in tre celle diverse (chiara, media, scura) e cella per cella perderebbe contro un
 * fondo tutto uguale, che invece è un colore solo.
 */
function familyOf(buckets: Bucket[]) {
  const hues = buckets.map((k) => k.hue / k.count);
  const near = (i: number, j: number) => hueDistance(hues[i], hues[j]) <= FAMILY_HUE;
  const presence = hues.map((_, i) =>
    buckets.reduce((sum, k, j) => sum + (near(i, j) ? k.presence : 0), 0),
  );

  /**
   * La cella che rappresenta la famiglia: la più presente, ma fra quelle che pesano
   * almeno la metà di lei vince la più viva — il giallo di *Roma* va in pagina come
   * giallo, non come l'oliva dei suoi bordi. Si guarda la vivacità vera (`chroma`) e non
   * la saturazione HSL, che premierebbe anche un rosso quasi nero: il cielo di *Stranger
   * Things* deve arrivare acceso com'è. `awayFrom` tiene la seconda tinta lontana dalla
   * prima.
   */
  const rep = (i: number, awayFrom?: number) => {
    const pool = buckets
      .map((k, j) => ({ k, j }))
      .filter(
        ({ j }) =>
          near(i, j) &&
          (awayFrom === undefined || hueDistance(hues[j], awayFrom) >= SECONDARY_HUE_MIN),
      );
    if (pool.length === 0) return buckets[i];
    const top = Math.max(...pool.map(({ k }) => k.presence));
    const alive = pool.filter(({ k }) => k.presence >= top * REP_TIE);
    return alive.reduce((a, b) =>
      b.k.chroma / b.k.count > a.k.chroma / a.k.count ? b : a,
    ).k;
  };

  return { hues, presence, rep };
}

/** Variante più scura e appena spostata di tonalità: la seconda tinta quando non c'è. */
function shade(rgb: [number, number, number]): [number, number, number] {
  const [h, s, l] = rgbToHsl(...rgb);
  return hslToRgb((h + 20) % 360, s * 0.85, Math.max(0.2, l - 0.16));
}

/** Peso della seconda tinta: quanto pesa sulla locandina, mai sotto poco più di metà. */
function weightOf(ratio: number): number {
  return 0.55 + 0.45 * Math.min(1, ratio);
}

/**
 * I due colori di fondo di una locandina, nelle proporzioni in cui ci sono davvero.
 *
 * - **il grigio è un candidato come gli altri**: vince quando la locandina è per lo più
 *   grigia o bianca (*Sin City* è ardesia con un titolo rosso, *Arcane* ha lo sfondo
 *   bianco), e allora il colore resta la seconda tinta, col peso che ha lì sopra. Prima
 *   il grigio era uno scarto e qualunque macchia colorata si prendeva tutta la pagina;
 * - un pixel pesa quanto è chiaro: su fondo nero un grigio scuro non si vede, un bianco
 *   sì. Per lo stesso motivo `intensity` scende sulle locandine quasi tutte nere;
 * - i colori sono raggruppati per tonalità (`familyOf`) e l'incarnato pesa meno: un
 *   volto grande non deve dare a ogni scheda lo stesso alone beige;
 * - la seconda tinta è la famiglia migliore ad almeno 40° dalla prima (o il grigio, se
 *   pesa di più); se non c'è, è una variante più scura della prima — nero e rosso resta
 *   nero e rosso.
 */
export function dominantColors(pixels: Uint8Array | Buffer, channels: number): Palette {
  const { buckets, grayPresence, gray, bodyShare, visible } = analyze(pixels, channels);
  if (buckets.length === 0 && !gray) return FALLBACK;

  const intensity = clamp(0.5 + 0.6 * bodyShare, INTENSITY_MIN, INTENSITY_MAX);
  const fam = familyOf(buckets);
  const best =
    buckets.length === 0 ? -1 : fam.presence.indexOf(Math.max(...fam.presence));

  // Il grigio vince: pagina in bianco e nero, col colore della locandina come dettaglio.
  if (gray && (best === -1 || grayPresence >= fam.presence[best])) {
    const ratio = best === -1 ? 0 : fam.presence[best] / grayPresence;
    const rep = best === -1 ? null : fam.rep(best);
    const vivid =
      rep !== null &&
      rep.chroma / rep.count >= ACCENT_CHROMA_MIN &&
      rep.count >= visible * ACCENT_PIXELS_MIN;
    const accent = rep !== null && (ratio >= ACCENT_SHARE_MIN || vivid);
    return {
      primary: gray,
      secondary: accent && rep ? tame(bucketRgb(rep)) : shade(gray),
      secondaryWeight: accent ? weightOf(ratio) : 1,
      intensity,
      neutral: true,
    };
  }

  const primary = tame(bucketRgb(fam.rep(best)));

  // Fra i candidati rimasti — l'altro colore, oppure il grigio — vince il più presente.
  let other = -1;
  for (let i = 0; i < buckets.length; i += 1) {
    if (hueDistance(fam.hues[i], fam.hues[best]) < SECONDARY_HUE_MIN) continue;
    if (other === -1 || fam.presence[i] > fam.presence[other]) other = i;
  }
  const otherPresence = other === -1 ? 0 : fam.presence[other];
  const useGray = gray !== null && grayPresence > otherPresence;
  const ratio = (useGray ? grayPresence : otherPresence) / fam.presence[best];
  if (ratio < SECONDARY_SHARE_MIN) {
    return {
      primary,
      secondary: shade(primary),
      secondaryWeight: 1,
      intensity,
      neutral: false,
    };
  }
  return {
    primary,
    secondary: useGray && gray ? gray : tame(bucketRgb(fam.rep(other, fam.hues[best]))),
    secondaryWeight: weightOf(ratio),
    intensity,
    neutral: false,
  };
}

/**
 * Tinta dominante, o `null` se l'immagine non ne ha nessuna (logo bianco/nero): a
 * differenza di `dominantColors` non ripiega su un grigio, così chi chiama può restare
 * sul neutro.
 */
export function dominantColor(
  pixels: Uint8Array | Buffer,
  channels: number,
): [number, number, number] | null {
  const { buckets } = analyze(pixels, channels);
  if (buckets.length === 0) return null;
  const fam = familyOf(buckets);
  return tame(bucketRgb(fam.rep(fam.presence.indexOf(Math.max(...fam.presence)))));
}

/** `rgba()` CSS da una tinta della palette. */
export function rgba(color: [number, number, number], alpha: number): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

/**
 * `rgba()` per un bagliore su nero: un grigio chiaro pesa più di una tinta (a parità di
 * opacità si vede di più), quindi le locandine in bianco e nero ricevono veli più
 * leggeri e non diventano lattiginose. Il dettaglio colorato di un bianco e nero non è
 * grigio, quindi resta pieno.
 */
export function glow(color: [number, number, number], alpha: number): string {
  const [, s] = rgbToHsl(...color);
  return rgba(color, s < 0.12 ? alpha * 0.72 : alpha);
}
