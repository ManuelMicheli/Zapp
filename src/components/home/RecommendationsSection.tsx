"use client";

import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/social/Avatar";
import { posterUrl } from "@/lib/config";
import { addWant } from "@/lib/watch/actions";
import { markRecommendationSeen } from "@/lib/social/actions";
import type { HomeRecommendation } from "@/lib/social/queries";
import { useOptimisticValue, withoutKey } from "@/lib/ui/optimistic";
import { useHomeType } from "./HomeType";

/**
 * In home segue la scheda in testata: sotto Film o Serie TV mostra solo quel tipo.
 * `label` e' la sopra-scritta dentro la sezione "I tuoi amici"; senza, resta il
 * titolo grande di quando la sezione era a se'.
 */
export function RecommendationsSection({
  items,
  label,
}: {
  items: HomeRecommendation[];
  label?: string;
}) {
  const { value: visible, run } = useOptimisticValue(items);
  const type = useHomeType()?.type;
  const shown =
    type && type !== "all" ? visible.filter((rec) => rec.mediaType === type) : visible;

  if (shown.length === 0) return null;

  return (
    <section className="px-5 lg:px-10">
      {label ? (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-2">
          {label}
        </p>
      ) : (
        <h2 className="mb-3 text-xl font-bold tracking-[-0.03em]">
          Consigliati da amici
        </h2>
      )}
      <div className="space-y-2.5">
        {shown.map((rec) => {
          const from = rec.from.display_name ?? rec.from.username;
          return (
            <div
              key={rec.id}
              className="flex items-center gap-3 rounded-[20px] border border-border bg-surface p-2.5"
            >
              <Link
                href={`/title/${rec.mediaType}/${rec.titleId}`}
                data-preview={`/title/${rec.mediaType}/${rec.titleId}`}
                className="relative h-[72px] w-12 shrink-0 overflow-hidden rounded-[10px] bg-surface-2"
              >
                {rec.posterPath && (
                  <Image
                    src={posterUrl(rec.posterPath, "w92")!}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                )}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate text-[15px] font-semibold">{rec.titleName}</p>
                <div className="flex items-center gap-1.5">
                  <Avatar url={rec.from.avatar_url} name={from} size={18} />
                  <p className="truncate text-xs text-muted">
                    {from}
                    {rec.message ? `: «${rec.message}»` : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="-my-1 min-h-11 shrink-0 rounded-full border border-accent/40 bg-accent/[0.18] px-3.5 text-xs font-semibold text-accent-pale"
                onClick={() =>
                  run(
                    withoutKey(visible, (r) => r.id, rec.id),
                    async () => {
                      const result = await addWant(rec.titleId, rec.mediaType);
                      // Un'aggiunta fallita non deve consumare il consiglio: altrimenti
                      // sparirebbe dalla home senza essere mai finito in "Da vedere".
                      if (result.ok) await markRecommendationSeen(rec.id);
                      return result;
                    },
                    { message: "Aggiunto a Da vedere" },
                  )
                }
              >
                Voglio vederlo
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
