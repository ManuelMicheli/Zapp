"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { AuthHeadline } from "@/components/auth/AuthHeadline";
import { BottomSheetStatic } from "@/components/layout/BottomSheetStatic";

const FIELD_CLASS =
  "h-[54px] w-full rounded-[14px] bg-surface-2 px-[18px] text-base text-text outline-none placeholder:text-muted focus:border focus:border-accent focus:ring-4 focus:ring-accent/15";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Credenziali non valide. Riprova.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <AuthHeadline
        wordmark
        title="Zapp"
        subtitle="Film e serie, tutte le piattaforme, un'unica app."
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
            <input
              type="password"
              required
              autoComplete="current-password"
              aria-label="Password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
          {error && <p className="px-1 text-sm text-danger">{error}</p>}
          <div className="flex flex-col gap-2.5">
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Accesso…" : "Accedi"}
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
          Non hai un account?{" "}
          <Link href="/signup" className="font-semibold text-accent-soft">
            Registrati
          </Link>
        </p>
      </BottomSheetStatic>
    </>
  );
}
