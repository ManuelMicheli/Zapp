import Image from "next/image";
import { providerLogoUrl } from "@/lib/config";
import type { LinkSource } from "@/lib/links/resolve";

export function ProviderButton({
  name,
  logoPath,
  url,
  source,
}: {
  name: string;
  logoPath: string | null;
  url: string | null;
  source: LinkSource | null;
}) {
  const logo = providerLogoUrl(logoPath);
  const inner = (
    <>
      {logo ? (
        <Image src={logo} alt="" width={36} height={36} className="rounded-lg" />
      ) : (
        <div className="size-9 rounded-lg bg-surface-2" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        {source === "search" && (
          <p className="truncate text-xs text-muted">Apre la ricerca su {name}</p>
        )}
        {url === null && (
          <p className="truncate text-xs text-muted">Disponibile nell&apos;app {name}</p>
        )}
      </div>
      {url !== null && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-muted"
          aria-hidden="true"
        >
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      )}
    </>
  );

  const classes =
    "flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors";

  if (url === null) {
    return <div className={classes}>{inner}</div>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className={`${classes} hover:bg-surface-2 active:bg-surface-2`}
    >
      {inner}
    </a>
  );
}
