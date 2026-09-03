"use client";

import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import { useToast } from "@/components/ui/Toaster";
import { incrementEpisode, restoreEntry } from "@/lib/watch/actions";

export interface WatchingCardProps {
  titleId: number;
  mediaType: "movie" | "tv";
  name: string;
  posterUrl: string | null;
  providerLogoUrl: string | null;
  providerName: string | null;
  continueUrl: string | null;
  progressLabel: string | null;
  progressPct: number | null;
}

export function WatchingCard(props: WatchingCardProps) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();

  function plusOne() {
    startTransition(async () => {
      const result = await incrementEpisode(props.titleId);
      if (!result.ok) {
        show("Errore. Riprova.");
        return;
      }
      const label =
        result.entry?.status === "watched"
          ? "Serie completata!"
          : `Sei a S${result.entry?.season_number}E${result.entry?.episode_number}`;
      show(label, {
        onUndo: () => {
          startTransition(async () => {
            await restoreEntry(props.titleId, "tv", result.prev);
          });
        },
      });
    });
  }

  return (
    <div className="w-36 shrink-0">
      <Link href={`/title/${props.mediaType}/${props.titleId}`} className="block">
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface">
          {props.posterUrl && (
            <Image
              src={props.posterUrl}
              alt={props.name}
              fill
              sizes="144px"
              className="object-cover"
            />
          )}
          {props.providerLogoUrl && (
            <Image
              src={props.providerLogoUrl}
              alt={props.providerName ?? ""}
              width={22}
              height={22}
              className="absolute bottom-1.5 left-1.5 rounded-md border border-black/40"
            />
          )}
          {props.progressPct != null && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
              <div
                className="h-full bg-accent"
                style={{ width: `${Math.round(props.progressPct * 100)}%` }}
              />
            </div>
          )}
        </div>
      </Link>
      <p className="mt-1.5 line-clamp-1 text-xs font-medium">{props.name}</p>
      {props.progressLabel && (
        <p className="text-[10px] text-muted">{props.progressLabel}</p>
      )}
      <div className="mt-1.5 flex gap-1.5">
        {props.continueUrl && (
          <a
            href={props.continueUrl}
            target="_blank"
            rel="noopener"
            className="flex-1 rounded-lg bg-accent py-1.5 text-center text-[11px] font-bold text-white"
          >
            Continua
          </a>
        )}
        {props.mediaType === "tv" && (
          <button
            type="button"
            disabled={pending}
            onClick={plusOne}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-50"
          >
            +1
          </button>
        )}
      </div>
    </div>
  );
}
