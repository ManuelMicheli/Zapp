"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { completeOnboarding, type OnboardingState } from "./actions";

const initialState: OnboardingState = { error: null };

export function OnboardingForm({ initialDisplayName }: { initialDisplayName: string }) {
  const [state, formAction, pending] = useActionState(completeOnboarding, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-[22px]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex h-[54px] items-center gap-0.5 rounded-[14px] bg-surface-2 px-[18px] focus-within:border focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
            <span className="text-muted">@</span>
            <input
              id="username"
              name="username"
              required
              minLength={3}
              maxLength={20}
              pattern="[a-z0-9_]{3,20}"
              autoCapitalize="none"
              autoCorrect="off"
              aria-label="Username"
              placeholder="es. cinefilo_92"
              className="flex-1 bg-transparent text-[17px] font-medium text-text outline-none placeholder:text-muted"
            />
          </div>
          <p className="px-1 text-xs text-muted-2">
            3–20 caratteri: lettere minuscole, numeri, underscore.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex h-[54px] items-center justify-between gap-2 rounded-[14px] bg-surface-2 px-[18px] focus-within:border focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
            <input
              id="display_name"
              name="display_name"
              maxLength={50}
              defaultValue={initialDisplayName}
              aria-label="Nome visualizzato"
              className="flex-1 bg-transparent text-[16px] text-text outline-none placeholder:text-muted"
            />
            <span className="shrink-0 text-xs text-muted-2">opzionale</span>
          </div>
          <p className="px-1 text-xs text-muted-2">Nome visualizzato</p>
        </div>
      </div>
      {state.error && <p className="px-1 text-sm text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvataggio…" : "Inizia a usare Zapp"}
      </Button>
    </form>
  );
}
