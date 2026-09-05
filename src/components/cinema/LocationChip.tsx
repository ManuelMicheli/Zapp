"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Icon } from "./icons";
import { LocationPrompt } from "./LocationPrompt";

/** "📍 Milano · Cambia": apre lo sheet per aggiornare la posizione. */
export function LocationChip({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass inline-flex h-9 max-w-full shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium"
      >
        <Icon name="pin" size={14} />
        <span className="truncate">{label}</span>
        <span className="text-muted">· Cambia</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Dove sei?">
        <LocationPrompt compact onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
