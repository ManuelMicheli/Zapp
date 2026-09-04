"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { AuthHeadline } from "@/components/auth/AuthHeadline";
import { BottomSheetStatic } from "@/components/layout/BottomSheetStatic";

const FIELD_CLASS =
  "h-[54px] w-full rounded-[14px] border border-transparent bg-surface-2 px-[18px] text-base text-text outline-none placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/15";

const EnvelopeIcon = (
  <div className="flex size-[68px] items-center justify-center rounded-[22px] border border-accent/45 bg-accent/[0.16] shadow-[0_0_0_10px_rgba(139,92,246,0.08),0_16px_40px_rgba(139,92,246,0.25)]">
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-accent-pale"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3.5 7.5l7.6 5.2a1.6 1.6 0 0 0 1.8 0l7.6-5.2" />
    </svg>
  </div>
);

export default function SignupPage() {
  // useSearchParams richiede un boundary Suspense nelle pagine statiche
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}

function SignupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // link invito ?ref=username: dopo l'onboarding parte la richiesta di amicizia
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref && /^[a-z0-9_]{3,20}$/.test(ref)) {
      document.cookie = `zapp_ref=${ref}; path=/; max-age=${30 * 24 * 3600}; samesite=lax`;
    }
  }, [searchParams]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      setError("Registrazione non riuscita. Riprova.");
      return;
    }
    if (data.session) {
      router.push("/onboarding");
      router.refresh();
    } else {
      // conferma email attiva sul progetto
      setCheckEmail(true);
    }
  }

  if (checkEmail) {
    // Nota: il muro di sfondo non viene sfocato in questo stato (deviazione
    // accettata dal brief: il layout è un Server Component condiviso e non
    // può reagire allo stato client di questa pagina).
    return (
      <>
        <AuthHeadline
          icon={EnvelopeIcon}
          title="Controlla la tua email"
          subtitle="Ti abbiamo inviato un link di conferma. Aprilo per completare la registrazione."
        />
        <BottomSheetStatic gap={18}>
          <div className="flex h-[54px] items-center justify-between rounded-[14px] bg-surface-2 px-[18px] text-[15px] text-muted">
            <span>{email}</span>
            <span className="flex items-center gap-1.5 font-medium text-accent-soft">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12l4.5 4.5L19 7" />
              </svg>
              Inviata
            </span>
          </div>
          <p className="text-center text-sm text-muted">
            Hai già un account?{" "}
            <Link href="/login" className="font-semibold text-accent-soft">
              Accedi
            </Link>
          </p>
        </BottomSheetStatic>
      </>
    );
  }

  return (
    <>
      <AuthHeadline
        title="Crea il tuo account"
        subtitle="Tieni traccia di film e serie, scopri dove vederli."
      />
      <BottomSheetStatic>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2.5">
            <input
              type="email"
              required
              autoComplete="email"
              aria-label="Email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD_CLASS}
            />
            <div className="flex flex-col gap-2">
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                aria-label="Password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={FIELD_CLASS}
              />
              <p className="px-1 text-xs text-muted-2">Almeno 8 caratteri.</p>
            </div>
          </div>
          {error && <p className="px-1 text-sm text-danger">{error}</p>}
          <div className="flex flex-col gap-2.5">
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creazione…" : "Crea account"}
            </Button>
            <div className="flex items-center gap-3 py-0.5">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-muted">oppure</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <GoogleButton />
          </div>
        </form>
        <p className="text-center text-sm text-muted">
          Hai già un account?{" "}
          <Link href="/login" className="font-semibold text-accent-soft">
            Accedi
          </Link>
        </p>
      </BottomSheetStatic>
    </>
  );
}
