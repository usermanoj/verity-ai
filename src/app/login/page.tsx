"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Provider } from "@supabase/supabase-js";

function LoginButtons() {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const next = searchParams.get("next") || "/";

  async function signIn(provider: Provider) {
    setError(null);
    setPending(provider);
    const { error: signInError } = await supabaseBrowser().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (signInError) {
      setError(signInError.message);
      setPending(null);
    }
    // On success, signInWithOAuth redirects the browser away — nothing more to do here.
  }

  if (!hasSupabase()) {
    return (
      <div className="glass rounded-2xl p-6 text-sm text-[var(--muted)]">
        Sign-in isn&apos;t configured for this deployment yet — Supabase env vars aren&apos;t set.
      </div>
    );
  }

  return (
    <div className="glass rounded-3xl p-6">
      <div className="space-y-3">
        <button
          onClick={() => signIn("google")}
          disabled={pending !== null}
          className="w-full rounded-2xl bg-[var(--brand)] px-6 py-3 font-medium text-white transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          {pending === "google" ? "Redirecting…" : "Continue with Google"}
        </button>
        <button
          onClick={() => signIn("azure")}
          disabled={pending !== null}
          className="glass w-full rounded-2xl px-6 py-3 font-medium transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          {pending === "azure" ? "Redirecting…" : "Continue with Microsoft"}
        </button>
      </div>
      {error && <p className="mt-4 text-sm text-[var(--warn)]">{error}</p>}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--brand)] text-2xl glow-brand">🛡️</span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Sign in to Verity AI</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Use your school&apos;s Google or Microsoft account.</p>
      <div className="mt-8 w-full">
        <Suspense fallback={null}>
          <LoginButtons />
        </Suspense>
      </div>
    </main>
  );
}
