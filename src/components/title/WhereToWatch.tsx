import { PROVIDERS } from "@/lib/config";
import { resolveProviderLink, type ResolvedLink } from "@/lib/links/resolve";
import type { TitleProviderRow } from "@/lib/tmdb/cache";
import type { Tables } from "@/types/database";
import { ProviderButton } from "./ProviderButton";

interface Entry {
  row: TitleProviderRow;
  link: ResolvedLink | null;
}

async function resolveAll(
  title: Tables<"titles">,
  rows: TitleProviderRow[],
): Promise<Entry[]> {
  return Promise.all(
    rows.map(async (row) => ({
      row,
      link: PROVIDERS[row.provider_id]
        ? await resolveProviderLink(title, row.provider_id)
        : null,
    })),
  );
}

function dedupe(rows: TitleProviderRow[]): TitleProviderRow[] {
  const seen = new Set<number>();
  return rows.filter((r) => {
    if (seen.has(r.provider_id)) return false;
    seen.add(r.provider_id);
    return true;
  });
}

export async function WhereToWatch({
  title,
  providers,
}: {
  title: Tables<"titles">;
  providers: TitleProviderRow[];
}) {
  const flatrate = dedupe(providers.filter((p) => p.kind === "flatrate"));
  const flatrateIds = new Set(flatrate.map((p) => p.provider_id));
  const other = dedupe(
    providers.filter((p) => p.kind !== "flatrate" && !flatrateIds.has(p.provider_id)),
  );

  if (flatrate.length === 0 && other.length === 0) {
    return (
      <section className="px-5 lg:px-0">
        <h2 className="mb-3 text-xl font-bold tracking-[-0.03em]">Dove guardarlo</h2>
        <p className="rounded-[20px] border border-border bg-surface p-4 text-sm text-muted">
          Non disponibile in streaming in Italia.
        </p>
      </section>
    );
  }

  const [flatrateEntries, otherEntries] = await Promise.all([
    resolveAll(title, flatrate),
    resolveAll(title, other),
  ]);

  return (
    <section className="px-5 lg:px-0">
      <h2 className="mb-3 text-xl font-bold tracking-[-0.03em]">Dove guardarlo</h2>

      {flatrateEntries.length > 0 && (
        <div className="space-y-2">
          {flatrateEntries.map(({ row, link }) => (
            <ProviderButton
              key={row.provider_id}
              name={row.provider_name}
              logoPath={row.logo_path}
              url={link?.url ?? null}
              kind="flatrate"
            />
          ))}
        </div>
      )}

      {otherEntries.length > 0 && (
        <details className="group mt-3" open={flatrateEntries.length === 0}>
          <summary className="cursor-pointer list-none py-3 text-[13px] font-medium text-accent-soft">
            <span className="group-open:hidden">Altre opzioni (noleggio/acquisto)</span>
            <span className="hidden group-open:inline">Altre opzioni</span>
          </summary>
          <div className="mt-2 space-y-2">
            {otherEntries.map(({ row, link }) => (
              <ProviderButton
                key={row.provider_id}
                name={row.provider_name}
                logoPath={row.logo_path}
                url={link?.url ?? null}
                kind="other"
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
