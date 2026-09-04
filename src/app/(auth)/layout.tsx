import { PosterWall } from "@/components/marketing/PosterWall";
import { getWallPosters } from "@/lib/tmdb/wall";

/**
 * Layout auth (login/signup): muro di locandine + gradiente + bagliore viola
 * sopra un foglio ancorato in basso, in stile mockup mobile.
 * Da `lg` in su: split a due colonne, muro a sinistra (55%) con wordmark,
 * form centrato a destra (45%) come card — mai una colonna stretta al centro.
 */
export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const posters = await getWallPosters();

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-bg lg:mx-0 lg:grid lg:max-w-none lg:grid-cols-[55%_45%]">
      <div className="absolute inset-0 overflow-hidden lg:relative lg:inset-auto lg:col-start-1 lg:h-full">
        <PosterWall posters={posters} height={640} className="lg:hidden" />
        {/* Desktop: 8 colonne larghe 1000px, così il muro copre tutta la colonna sinistra */}
        <PosterWall
          posters={posters}
          columns={8}
          width={1000}
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
        <div
          className="absolute -left-[120px] top-[260px] h-80 w-[420px] rounded-full blur-[40px]"
          style={{
            background:
              "radial-gradient(circle,rgba(139,92,246,.35) 0%,rgba(139,92,246,.10) 45%,transparent 70%)",
          }}
        />
        <div className="hidden lg:absolute lg:bottom-12 lg:left-12 lg:flex lg:flex-col lg:gap-2">
          <div className="text-[56px] font-bold leading-none tracking-[-0.05em] text-text">
            Zapp<span className="text-accent">.</span>
          </div>
          <p className="max-w-[300px] text-[17px] leading-[1.4] text-white/[0.72]">
            Film e serie, tutte le piattaforme, un&apos;unica app.
          </p>
        </div>
      </div>

      <div className="relative flex min-h-dvh flex-col lg:col-start-2 lg:items-center lg:justify-center lg:overflow-y-auto lg:px-10 lg:py-12">
        {children}
      </div>
    </div>
  );
}
