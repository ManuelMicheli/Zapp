import Image from "next/image";
import { PROVIDERS, providerLogoUrl } from "@/lib/config";

export function ProviderButton({
  name,
  logoPath,
  url,
  direct,
  kind,
  providerId,
  titleName,
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
        <span className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-[18px] text-sm font-semibold text-white shadow-[var(--shadow-accent)]">
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

  const classes =
    "flex w-full items-center gap-3.5 rounded-[20px] border border-border bg-surface py-3 pl-3.5 pr-3";

  // nessun link possibile: riga informativa, senza chip cliccabile
  if (href === null) {
    return <div className={classes}>{inner}</div>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={`${classes} transition-colors hover:bg-surface-2`}
    >
      {inner}
    </a>
  );
}
