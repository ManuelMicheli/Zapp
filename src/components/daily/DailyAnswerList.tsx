"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { posterUrl } from "@/lib/config";
import { Avatar } from "@/components/social/Avatar";
import { fetchDailyAnswers, reportDailyAnswer } from "@/lib/daily/actions";
import type { DailyAnswerItem } from "@/lib/daily/queries";
import { useToast } from "@/components/ui/Toaster";

/** Le risposte di oggi, dalla più recente. Mai per voti: vedi la spec. */
export function DailyAnswerList() {
  const { show } = useToast();
  const [items, setItems] = useState<DailyAnswerItem[] | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void fetchDailyAnswers().then((rows) => {
      if (alive) setItems(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!items) {
    return <p className="px-5 py-6 text-[13px] text-muted lg:px-10">Caricamento…</p>;
  }
  if (items.length === 0) {
    return (
      <p className="px-5 py-6 text-[13px] text-muted lg:px-10">
        Ancora nessuna risposta oggi. Sii il primo.
      </p>
    );
  }

  return (
    <ul className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-5 pb-24 lg:px-10">
      {items
        .filter((a) => !hidden.includes(a.id))
        .map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 rounded-[20px] border border-border bg-surface p-3"
          >
            <Link href={`/title/${a.mediaType}/${a.titleId}`} className="shrink-0">
              <div className="relative aspect-[2/3] w-12 overflow-hidden rounded-[10px] bg-surface-2">
                {a.posterPath && (
                  <Image
                    src={posterUrl(a.posterPath, "w185")!}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                )}
              </div>
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-text">{a.title}</p>
              {a.reason && <p className="text-[13px] text-muted">«{a.reason}»</p>}
              {a.authorUsername ? (
                <Link
                  href={`/u/${a.authorUsername}`}
                  className="mt-1 flex w-fit items-center gap-2"
                >
                  <Avatar url={a.authorAvatar} name={a.authorName} size={20} />
                  <span className="text-[12px] text-muted-2">{a.authorName}</span>
                </Link>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <Avatar url={a.authorAvatar} name={a.authorName} size={20} />
                  <span className="text-[12px] text-muted-2">{a.authorName}</span>
                </div>
              )}
            </div>
            {!a.mine && a.reason && (
              <button
                type="button"
                className="shrink-0 text-[12px] text-muted-2"
                onClick={async () => {
                  const res = await reportDailyAnswer(a.id);
                  show(res.ok ? "Segnalata" : (res.error ?? "Non è riuscito, riprova."));
                  if (res.ok) setHidden((h) => [...h, a.id]);
                }}
              >
                Segnala
              </button>
            )}
          </li>
        ))}
    </ul>
  );
}
