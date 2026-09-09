// Package Android delle app di streaming → id provider TMDB (watch/providers, regione IT).
// I package NOW sono provvisori: si confermano con lo spike sulla Fire TV (spec §14).

export const SUPPORTED_PROVIDERS = [8, 119, 337, 39] as const;

const PACKAGES: Record<string, number> = {
  "com.netflix.ninja": 8, // Netflix su Fire TV / Android TV
  "com.netflix.mediaclient": 8, // Netflix telefono/tablet
  "com.amazon.avod": 119, // Prime Video Fire TV
  "com.amazon.firebat": 119, // Prime Video Fire TV (nuovo client)
  "com.amazon.avod.thirdpartyclient": 119, // Prime Video Android
  "com.disney.disneyplus": 337,
  "com.nowtv.it": 39,
  "it.sky.nowtv": 39,
  "com.bskyb.nowtv.beta": 39,
};

export function providerForPackage(pkg: string): number | null {
  return PACKAGES[pkg] ?? null;
}
