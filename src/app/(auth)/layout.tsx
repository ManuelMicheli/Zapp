import { PosterWall } from "@/components/marketing/PosterWall";
import { getWallPosters } from "@/lib/tmdb/wall";

/**
 * Layout auth (login/signup): muro di locandine + gradiente + bagliore viola
 * sopra un foglio ancorato in basso, in stile mockup mobile.
 * Da `lg` in su: il muro occupa i tre quarti dello schermo (fluido, 20 colonne)
 * e sfuma nel pannello a destra, una colonna piena con titolo e form allineati
 * a sinistra — mai una card stretta al centro del nero. Il pannello non scende
 * sotto 380px: sotto ~1520px il muro cede spazio, i campi no.
 */
export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const posters = await getWallPosters();

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-bg lg:mx-0 lg:grid lg:max-w-none lg:grid-cols-[3fr_minmax(380px,1fr)]">
      <div className="absolute inset-0 overflow-hidden lg:relative lg:inset-auto lg:col-start-1 lg:h-full">
        <PosterWall posters={posters} height={640} className="lg:hidden" />
        {/* Desktop: muro fluido su tutta la colonna, anche a 2560px */}
        <PosterWall
          posters={posters}
          columns={20}
          width="calc(100% + 140px)"
          height={1600}
          className="hidden lg:block"
        />
        {/* Mobile: sfumatura più carica, ancorata al titolo (y 260-400) */}
        <div
          className="absolute inset-x-0 top-0 h-[560px] lg:hidden"
          style={{
            background:
              "linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,.15) 18%,rgba(0,0,0,.55) 40%,rgba(0,0,0,.92) 62%,#000 78%)",
          }}
        />
        {/* Desktop: velo leggero, il muro resta nitido fino in fondo */}
        <div
          className="absolute inset-0 hidden lg:block"
          style={{
            background:
              "linear-gradient(180deg,rgba(0,0,0,.35) 0%,rgba(0,0,0,.05) 22%,rgba(0,0,0,.45) 62%,rgba(0,0,0,.82) 88%,rgba(0,0,0,.94) 100%)",
          }}
        />
        {/* Desktop: il muro sfuma nel pannello, niente taglio netto */}
        <div
          className="absolute inset-y-0 right-0 hidden w-[220px] lg:block"
          style={{
            background:
              "linear-gradient(90deg,transparent 0%,rgba(10,10,12,.55) 55%,#0a0a0c 100%)",
          }}
        />
        <div
          className="absolute -left-[120px] top-[260px] h-80 w-[420px] rounded-full blur-[40px]"
          style={{
            background:
              "radial-gradient(circle,rgba(139,92,246,.35) 0%,rgba(139,92,246,.10) 45%,transparent 70%)",
          }}
        />
        <div className="hidden lg:absolute lg:bottom-14 lg:left-14 lg:flex lg:flex-col lg:gap-3">
          <div className="text-[72px] font-bold leading-none tracking-[-0.055em] text-text 2xl:text-[96px]">
            Zapp<span className="text-accent">.</span>
          </div>
          <p className="max-w-[340px] text-[19px] leading-[1.4] text-white/[0.72] 2xl:max-w-[420px] 2xl:text-[23px]">
            Film e serie, tutte le piattaforme, un&apos;unica app.
          </p>
        </div>
      </div>

      <div className="relative flex min-h-dvh flex-col lg:col-start-2 lg:overflow-y-auto lg:border-l lg:border-white/[0.06] lg:bg-sheet lg:px-12 lg:py-16 xl:px-16 2xl:px-24">
        {/* Bagliore viola in alto: separa il pannello dal nero senza una card */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 hidden h-[420px] w-[520px] -translate-x-1/2 rounded-full blur-[60px] lg:block"
          style={{
            background:
              "radial-gradient(circle,rgba(139,92,246,.22) 0%,rgba(139,92,246,.06) 45%,transparent 70%)",
          }}
        />
        <div className="relative flex min-h-dvh flex-col lg:my-auto lg:min-h-0 lg:w-full lg:max-w-[400px] lg:gap-9 2xl:max-w-[460px] 2xl:gap-11">
          {children}
        </div>
      </div>
    </div>
  );
}
