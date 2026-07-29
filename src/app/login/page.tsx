"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Provider } from "@supabase/supabase-js";

// The callback has always redirected here with ?error=… on failure, and this
// page has always thrown it away — so a failed sign-in was pixel-identical to
// a fresh one. You authenticate with Google, arrive back at "Sign in to
// Verity AI", and the only available conclusion is that the button doesn't
// work.
//
// Each message says what a person can actually do about it. "no_account" and
// "no_school" are setup faults, not user faults, and saying so is what stops
// someone trying the same thing a third time.
const ERRORS: Record<string, string> = {
  auth_failed: "Sign-in didn't complete. Please try again.",
  missing_code: "Sign-in didn't complete. Please try again.",
  no_account:
    "You're signed in with your school account, but you don't have access to Verity AI yet. Ask your teacher or IT admin to add you.",
  no_school:
    "This site isn't finished being set up — no school has been configured yet. Please contact your IT admin.",
  provisioning_failed:
    "We signed you in but couldn't finish setting up your account. Please try again, or contact your IT admin.",
};

function LoginButtons() {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const next = searchParams.get("next") || "/";
  const errorCode = searchParams.get("error");
  const errorFromCallback = errorCode ? (ERRORS[errorCode] ?? ERRORS.auth_failed) : null;

  async function signIn(provider: Provider) {
    setError(null);
    setPending(provider);
    const { error: signInError } = await supabaseBrowser().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // Always show the account chooser.
        //
        // With one account signed into the browser, Google and Microsoft both
        // skip it and re-authenticate silently — so signing out and pressing
        // "Continue with Google" landed straight back in the same account,
        // which looks like sign-out not working.
        //
        // It matters beyond testing: a school device is shared, and a student
        // who follows the previous student's session is a real incident. The
        // chooser is the only thing that makes "who am I signing in as" a
        // decision rather than an assumption.
        queryParams: { prompt: "select_account" },
      },
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
      {errorFromCallback && (
        <p
          role="alert"
          className="mb-4 rounded-2xl border border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.08)] px-4 py-3 text-left text-sm"
        >
          {errorFromCallback}
        </p>
      )}
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
      {/* The question this page kept failing to answer: "which role am I
          signing in as?"
          None — and that is the point. A role is granted by the school, not
          picked at a login, or any student could elect to be a principal.
          But refusing a choice without explaining why reads as the page
          having forgotten to ask, so it says so plainly and tells them what
          happens next. */}
      <p className="mt-4 max-w-sm text-sm text-[var(--muted)]">
        There is nothing to choose here. Your school decides whether you are a{" "}
        <span className="text-[var(--text)]">student</span>, <span className="text-[var(--text)]">teacher</span>,{" "}
        <span className="text-[var(--text)]">head of department</span> or{" "}
        <span className="text-[var(--text)]">principal</span> — signing in takes you straight to the right place.
      </p>
      <div className="mt-8 w-full">
        <Suspense fallback={null}>
          <LoginButtons />
        </Suspense>
      </div>
    </main>
  );
}
