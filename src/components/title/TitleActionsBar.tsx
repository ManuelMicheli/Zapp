"use client";

import { useOptimistic, useState, useTransition } from "react";
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
}

export function TitleActionsBar({
  titleId,
  mediaType,
  initialEntry,
  continueLinks,
  isSeries,
  nextEpisodeLabel,
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

  const primaryButton = () => {
    switch (status) {
      case null:
        return (
          <ActionButton
            primary
            label="Voglio vederlo"
            onClick={() =>
              run({ ...snapshotBase, status: "want" }, () => addWant(titleId, mediaType), "Aggiunto a Da vedere")
            }
          />
        );
      case "want":
        return (
          <ActionButton
            primary
            label="Inizia"
            onClick={() =>
              run(
                { ...snapshotBase, status: "watching" },
                () => startWatching(titleId, mediaType),
                "Spostato in Sto guardando",
              )
            }
          />
        );
      case "watching":
        if (primaryLink) {
          return (
            <a
              href={primaryLink.url}
              target="_blank"
              rel="noopener"
              onClick={(e) => {
                if (continueLinks.length > 1 && e.altKey) {
                  e.preventDefault();
                  setProvidersOpen(true);
                }
              }}
              onContextMenu={(e) => {
                if (continueLinks.length > 1) {
                  e.preventDefault();
                  setProvidersOpen(true);
                }
              }}
              className="flex-1 rounded-xl bg-accent px-4 py-3 text-center text-sm font-bold text-white"
            >
              Continua su {primaryLink.providerName}
            </a>
          );
        }
        return (
          <ActionButton
            primary
            label={isSeries ? "Segna progresso" : "Finito"}
            onClick={() => {
              if (isSeries) {
                document
                  .getElementById("series-progress")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              } else {
                run(
                  { ...snapshotBase, status: "watched" },
                  () => markWatched(titleId, mediaType),
                  "Segnato come visto",
                );
              }
            }}
          />
        );
      case "watched":
        if (optimisticEntry?.rating == null) {
          return <ActionButton primary label="Vota" onClick={() => setRateOpen(true)} />;
        }
        return (
          <ActionButton
            primary
            label={`★ ${optimisticEntry.rating} · Rivedi`}
            onClick={() =>
              run(
                { ...snapshotBase, status: "watching" },
                () => startWatching(titleId, mediaType),
                "Di nuovo in Sto guardando",
              )
            }
          />
        );
      case "dropped":
        return (
          <ActionButton
            primary
            label="Riprendi"
            onClick={() =>
              run(
                { ...snapshotBase, status: "watching" },
                () => startWatching(titleId, mediaType),
                "Ripreso",
              )
            }
          />
        );
    }
  };

  const secondaryButton = () => {
    switch (status) {
      case null:
        return (
          <ActionButton
            label="Inizia"
            onClick={() =>
              run(
                { ...snapshotBase, status: "watching" },
                () => startWatching(titleId, mediaType),
                "Spostato in Sto guardando",
              )
            }
          />
        );
      case "want":
        return (
          <ActionButton
            label="Rimuovi"
            onClick={() =>
              run(null, () => removeEntry(titleId, mediaType), "Rimosso")
            }
          />
        );
      case "watching":
        if (isSeries) {
          return (
            <ActionButton
              label={
                nextEpisodeLabel ? `Prossimo (${nextEpisodeLabel})` : "Prossimo episodio"
              }
              onClick={() =>
                run(
                  snapshotBase,
                  () => incrementEpisode(titleId),
                  "Episodio segnato",
                )
              }
            />
          );
        }
        return (
          <ActionButton
            label="Finito"
            onClick={() =>
              run(
                { ...snapshotBase, status: "watched" },
                () => markWatched(titleId, mediaType),
                "Segnato come visto",
              )
            }
          />
        );
      case "watched":
        if (optimisticEntry?.rating == null) {
          return (
            <ActionButton
              label="Rivedi"
              onClick={() =>
                run(
                  { ...snapshotBase, status: "watching" },
                  () => startWatching(titleId, mediaType),
                  "Di nuovo in Sto guardando",
                )
              }
            />
          );
        }
        return <ActionButton label="Vota" onClick={() => setRateOpen(true)} />;
      case "dropped":
        return (
          <ActionButton
            label="Rimuovi"
            onClick={() => run(null, () => removeEntry(titleId, mediaType), "Rimosso")}
          />
        );
    }
  };

  return (
    <>
      <div className="pb-safe fixed inset-x-0 bottom-14 z-30 mx-auto w-full max-w-[480px] border-t border-border bg-bg/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          {primaryButton()}
          {secondaryButton()}
          <button
            type="button"
            aria-label="Altre azioni"
            onClick={() => setMenuOpen(true)}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
        </div>
      </div>

      {/* menu altro */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Azioni">
        <div className="space-y-1">
          <SheetItem
            label="Voglio vederlo"
            onClick={() => {
              setMenuOpen(false);
              run({ ...snapshotBase, status: "want" }, () => addWant(titleId, mediaType), "Aggiunto a Da vedere");
            }}
          />
          <SheetItem
            label="Sto guardando"
            onClick={() => {
              setMenuOpen(false);
              run({ ...snapshotBase, status: "watching" }, () => startWatching(titleId, mediaType), "Spostato in Sto guardando");
            }}
          />
          <SheetItem
            label="Visto"
            onClick={() => {
              setMenuOpen(false);
              run({ ...snapshotBase, status: "watched" }, () => markWatched(titleId, mediaType), "Segnato come visto");
            }}
          />
          <SheetItem
            label="Abbandona"
            onClick={() => {
              setMenuOpen(false);
              run({ ...snapshotBase, status: "dropped" }, () => dropTitle(titleId, mediaType), "Abbandonato");
            }}
          />
          <SheetItem label="Vota" onClick={() => { setMenuOpen(false); setRateOpen(true); }} />
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
              className={`rounded-xl py-3 text-base font-bold ${
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
            className="mt-3 w-full py-2 text-center text-sm text-muted"
          >
            Rimuovi voto
          </button>
        )}
      </Sheet>

      {/* scelta provider (long press / tasto destro su Continua) */}
      <Sheet open={providersOpen} onClose={() => setProvidersOpen(false)} title="Continua su">
        <div className="space-y-1">
          {continueLinks.map((link) => (
            <a
              key={link.providerName}
              href={link.url}
              target="_blank"
              rel="noopener"
              className="block rounded-xl px-4 py-3 text-base font-medium hover:bg-surface-2"
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

function ActionButton({
  label,
  onClick,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? "flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white"
          : "flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold"
      }
    >
      {label}
    </button>
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
      className={`block w-full rounded-xl px-4 py-3 text-left text-base font-medium hover:bg-surface-2 ${
        danger ? "text-danger" : ""
      }`}
    >
      {label}
    </button>
  );
}
