"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { completeOnboarding, type OnboardingState } from "./actions";

const initialState: OnboardingState = { error: null };

export function OnboardingForm({
  initialDisplayName,
}: {
  initialDisplayName: string;
}) {
  const [state, formAction, pending] = useActionState(
    completeOnboarding,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="username" className="mb-1.5 block text-sm font-medium">
          Username
        </label>
        <input
          id="username"
          name="username"
          required
          minLength={3}
          maxLength={20}
          pattern="[a-z0-9_]{3,20}"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="es. cinefilo_92"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
        />
        <p className="mt-1 text-xs text-muted">
          3–20 caratteri: lettere minuscole, numeri, underscore.
        </p>
      </div>
      <div>
        <label htmlFor="display_name" className="mb-1.5 block text-sm font-medium">
          Nome visualizzato <span className="text-muted">(opzionale)</span>
        </label>
        <input
          id="display_name"
          name="display_name"
          maxLength={50}
          defaultValue={initialDisplayName}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
        />
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvataggio…" : "Inizia a usare Zapp"}
      </Button>
    </form>
  );
}
