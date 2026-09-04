"use client";

import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import {
  addWant,
  dropTitle,
  incrementEpisode,
  markWatched,
  removeEntry,
  restoreEntry,
  setPrivate,
  setRating,
  startWatching,
  type ActionResult,
  type EntrySnapshot,
  type MediaType,
} from "@/lib/watch/actions";
import { RecommendSheet } from "./RecommendSheet";
import type { MiniProfile } from "@/lib/social/queries";

export interface ContinueLink {
  providerName: string;
  url: string;
}

interface Props {
  titleId: number;
  mediaType: MediaType;
  titleName: string;
  initialEntry: EntrySnapshot | null;
  continueLinks: ContinueLink[];
  isSeries: boolean;
  nextEpisodeLabel: string | null;
  friends: MiniProfile[];
}

/** Icone inline: stroke 1.8 come il resto della UI. */
const ICONS = {
  plus: <path d="M12 5v14M5 12h14" />,
  play: <path d="M7 4.5v15l13-7.5z" />,
  check: <path d="M5 12l4.5 4.5L19 7" />,
  star: (
    <path d="M12 2l2.94 6.26 6.87.86-5.06 4.73 1.3 6.79L12 17.27l-6.05 3.37 1.3-6.79L2.19 9.12l6.87-.86L12 2z" />
  ),
} satisfies Record<string, ReactNode>;

type IconName = keyof typeof ICONS;

/** Riga dello sheet "Azioni": stesse classi per bottoni e link. */
const SHEET_ITEM =
  "block w-full rounded-2xl px-4 py-3 text-left text-base font-medium hover:bg-surface-2";

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

export function TitleActionsBar({
  titleId,
  mediaType,
  initialEntry,
  continueLinks,
  isSeries,
  nextEpisodeLabel,
  friends,
}: Props) {
  const { show } = useToast();
  const [, startTransition] = useTransition();
  const [entry, setEntry] = useState(initialEntry);
  const [optimisticEntry, applyOptimistic] = useOptimistic(
    entry,
    (_current, next: EntrySnapshot | null) => next,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [providersOpen, setProvidersOpen] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);

  function run(
    optimistic: EntrySnapshot | null,
    action: () => Promise<ActionResult>,
    message: string,
  ) {
    startTransition(async () => {
      applyOptimistic(optimistic);
      const result = await action();
      if (!result.ok) {
        show("Qualcosa è andato storto. Riprova.");
        return;
      }
      setEntry(result.entry);
      show(message, {
        onUndo: () => {
          startTransition(async () => {
            applyOptimistic(result.prev);
            const undone = await restoreEntry(titleId, mediaType, result.prev);
            if (undone.ok) setEntry(undone.entry);
          });
        },
      });
    });
  }

  const status = optimisticEntry?.status ?? null;
  const snapshotBase: EntrySnapshot = optimisticEntry ?? {
    status: "want",
    rating: null,
    season_number: null,
    episode_number: null,
    is_private: false,
    started_at: null,
    finished_at: null,
  };

  const primaryLink = continueLinks[0] ?? null;

  // azione principale: una sola pillola, come nel mockup
  const primary: { label: string; icon: IconName; onClick: () => void } = (() => {
    switch (status) {
      case "want":
        return {
          label: "Inizia",
          icon: "play" as const,
          onClick: () =>
            run(
              { ...snapshotBase, status: "watching" },
              () => startWatching(titleId, mediaType),
              "Spostato in Sto guardando",
            ),
        };
      case "watching":
        if (isSeries) {
          return {
            label: "Prossimo episodio",
            icon: "check" as const,
            onClick: () =>
              run(snapshotBase, () => incrementEpisode(titleId), "Episodio segnato"),
          };
        }
        return {
          label: "Finito",
          icon: "check" as const,
          onClick: () =>
            run(
              { ...snapshotBase, status: "watched" },
              () => markWatched(titleId, mediaType),
              "Segnato come visto",
            ),
        };
      case "watched":
        if (optimisticEntry?.rating == null) {
          return {
            label: "Vota",
            icon: "star" as const,
            onClick: () => setRateOpen(true),
          };
        }
        return {
          label: "Rivedi",
          icon: "play" as const,
          onClick: () =>
            run(
              { ...snapshotBase, status: "watching" },
              () => startWatching(titleId, mediaType),
              "Di nuovo in Sto guardando",
            ),
        };
      case "dropped":
        return {
          label: "Riprendi",
          icon: "play" as const,
          onClick: () =>
            run(
              { ...snapshotBase, status: "watching" },
              () => startWatching(titleId, mediaType),
              "Ripreso",
            ),
        };
      default:
        return {
          label: "Voglio vederlo",
          icon: "plus" as const,
          onClick: () =>
            run(
              { ...snapshotBase, status: "want" },
              () => addWant(titleId, mediaType),
              "Aggiunto a Da vedere",
            ),
        };
    }
  })();

  return (
    <>
      {/* sfumatura sotto la barra: solo mobile, dove la barra è fissa */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-[150px] bg-gradient-to-b from-transparent via-black/90 to-black lg:hidden" />

      <div
        className="fixed inset-x-4 z-30 mx-auto flex max-w-[448px] gap-2 lg:static lg:mx-0 lg:max-w-none lg:px-0"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)" }}
      >
        <button
          type="button"
          onClick={primary.onClick}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-white shadow-[0_10px_30px_rgba(139,92,246,0.45)]"
        >
          <Icon name={primary.icon} />
          {primary.label}
        </button>

        <button
          type="button"
          aria-label="Vota"
          onClick={() => setRateOpen(true)}
          className="flex size-14 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-[rgba(28,28,30,0.85)] backdrop-blur-xl"
        >
          <Icon name="star" size={20} />
        </button>

        <button
          type="button"
          aria-label="Altre azioni"
          onClick={() => setMenuOpen(true)}
          className="flex size-14 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-[rgba(28,28,30,0.85)] backdrop-blur-xl"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      </div>

      {/* menu altro */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Azioni">
        <div className="space-y-1">
          {primaryLink &&
            (continueLinks.length > 1 ? (
              <SheetItem
                label={`Continua su ${primaryLink.providerName}`}
                onClick={() => {
                  setMenuOpen(false);
                  setProvidersOpen(true);
                }}
              />
            ) : (
              // link vero: i popup bloccati e la PWA iOS non gradiscono window.open
              <a
                href={primaryLink.url}
                target="_blank"
                rel="noopener"
                onClick={() => setMenuOpen(false)}
                className={SHEET_ITEM}
              >
                Continua su {primaryLink.providerName}
              </a>
            ))}
          {isSeries && status === "watching" && (
            <SheetItem
              label={
                nextEpisodeLabel ? `Prossimo (${nextEpisodeLabel})` : "Prossimo episodio"
              }
              onClick={() => {
                setMenuOpen(false);
                run(snapshotBase, () => incrementEpisode(titleId), "Episodio segnato");
              }}
            />
          )}
          <SheetItem
            label="Voglio vederlo"
            onClick={() => {
              setMenuOpen(false);
              run(
                { ...snapshotBase, status: "want" },
                () => addWant(titleId, mediaType),
                "Aggiunto a Da vedere",
              );
            }}
          />
          <SheetItem
            label="Sto guardando"
            onClick={() => {
              setMenuOpen(false);
              run(
                { ...snapshotBase, status: "watching" },
                () => startWatching(titleId, mediaType),
                "Spostato in Sto guardando",
              );
            }}
          />
          <SheetItem
            label="Visto"
            onClick={() => {
              setMenuOpen(false);
              run(
                { ...snapshotBase, status: "watched" },
                () => markWatched(titleId, mediaType),
                "Segnato come visto",
              );
            }}
          />
          <SheetItem
            label="Abbandona"
            onClick={() => {
              setMenuOpen(false);
              run(
                { ...snapshotBase, status: "dropped" },
                () => dropTitle(titleId, mediaType),
                "Abbandonato",
              );
            }}
          />
          <SheetItem
            label="Vota"
            onClick={() => {
              setMenuOpen(false);
              setRateOpen(true);
            }}
          />
          <SheetItem
            label="Consiglia a un amico"
            onClick={() => {
              setMenuOpen(false);
              setRecommendOpen(true);
            }}
          />
          {optimisticEntry && (
            <SheetItem
              label={optimisticEntry.is_private ? "Rendi pubblico" : "Segna privato"}
              onClick={() => {
                setMenuOpen(false);
                run(
                  { ...snapshotBase, is_private: !optimisticEntry.is_private },
                  () => setPrivate(titleId, mediaType, !optimisticEntry.is_private),
                  optimisticEntry.is_private ? "Reso pubblico" : "Segnato privato",
                );
              }}
            />
          )}
          <SheetItem
            label="Rimuovi dalla libreria"
            danger
            onClick={() => {
              setMenuOpen(false);
              run(null, () => removeEntry(titleId, mediaType), "Rimosso");
            }}
          />
        </div>
      </Sheet>

      {/* vota */}
      <Sheet open={rateOpen} onClose={() => setRateOpen(false)} title="Il tuo voto">
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setRateOpen(false);
                run(
                  { ...snapshotBase, rating: n },
                  () => setRating(titleId, mediaType, n),
                  `Votato ${n}/10`,
                );
              }}
              className={`h-12 rounded-2xl text-base font-bold ${
                optimisticEntry?.rating === n
                  ? "bg-accent text-white"
                  : "border border-border bg-surface-2"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        {optimisticEntry?.rating != null && (
          <button
            type="button"
            onClick={() => {
              setRateOpen(false);
              run(
                { ...snapshotBase, rating: null },
                () => setRating(titleId, mediaType, null),
                "Voto rimosso",
              );
            }}
            className="mt-3 w-full py-3 text-center text-sm text-muted"
          >
            Rimuovi voto
          </button>
        )}
      </Sheet>

      <RecommendSheet
        open={recommendOpen}
        onClose={() => setRecommendOpen(false)}
        titleId={titleId}
        mediaType={mediaType}
        friends={friends}
      />

      {/* scelta provider quando ce n'è più di uno */}
      <Sheet
        open={providersOpen}
        onClose={() => setProvidersOpen(false)}
        title="Continua su"
      >
        <div className="space-y-1">
          {continueLinks.map((link) => (
            <a
              key={link.providerName}
              href={link.url}
              target="_blank"
              rel="noopener"
              className="block rounded-2xl px-4 py-3 text-base font-medium hover:bg-surface-2"
              onClick={() => setProvidersOpen(false)}
            >
              {link.providerName}
            </a>
          ))}
        </div>
      </Sheet>
    </>
  );
}

function SheetItem({
  label,
  onClick,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${SHEET_ITEM} ${danger ? "text-danger" : ""}`}
    >
      {label}
    </button>
  );
}
