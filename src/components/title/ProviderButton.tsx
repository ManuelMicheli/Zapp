import Image from "next/image";
import { PROVIDERS, providerLogoUrl, providerTint } from "@/lib/config";

export function ProviderButton({
  name,
  logoPath,
  url,
  direct,
  kind,
  providerId,
  titleName,
  brand,
}: {
  name: string;
  logoPath: string | null;
  url: string | null;
  /** true se `url` porta alla pagina esatta del titolo (non alla ricerca). */
  direct: boolean;
  /** "flatrate" = incluso nell'abbonamento, "other" = noleggio/acquisto. */
  kind: "flatrate" | "other";
  providerId: number;
  /** Titolo da passare alla ricerca del provider quando manca il deep link. */
  titleName: string;
  /** Colore del marchio (mappa o logo, vedi `getProviderBrand`). */
  brand: string;
}) {
  const logo = providerLogoUrl(logoPath);
  // senza deep link si ricade sulla ricerca del provider, se ne conosciamo l'URL
  const searchUrl = PROVIDERS[providerId]?.searchUrl.replace(
    "{query}",
    encodeURIComponent(titleName),
  );
  const href = url ?? searchUrl ?? null;

  const inner = (
    <>
      {logo ? (
        <Image
          src={logo}
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div className="size-11 shrink-0 rounded-xl bg-surface-2" />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-[15px] font-semibold">{name}</p>
        <p className="truncate text-xs text-muted">
          {kind === "flatrate" ? "Incluso nell'abbonamento" : "A noleggio o acquisto"}
        </p>
      </div>

      {url !== null && direct ? (
        <span className="glass flex h-10 shrink-0 items-center gap-1.5 rounded-full px-[18px] text-sm font-semibold">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
          </svg>
          Apri
        </span>
      ) : href !== null ? (
        <span className="glass flex h-10 shrink-0 items-center rounded-full px-[18px] text-sm font-semibold">
          Cerca
        </span>
      ) : null}
    </>
  );

  // sfumatura leggera del marchio sulla card (scelta utente 2026-09-07): ce l'hanno
  // tutti i servizi, anche quelli fuori da `PROVIDER_BRAND` (colore preso dal logo)
  const tint = providerTint(brand);
  const classes =
    "flex w-full items-center gap-3.5 rounded-[20px] border border-border bg-surface py-3 pl-3.5 pr-3";

  // nessun link possibile: riga informativa, senza chip cliccabile
  if (href === null) {
    return (
      <div className={classes} style={tint}>
        {inner}
      </div>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={`${classes} transition-opacity hover:opacity-90`}
      style={tint}
    >
      {inner}
    </a>
  );
}
