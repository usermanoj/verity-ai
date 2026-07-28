"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// The client-side twin of SessionBadge.
//
// The landing pages are STATIC on purpose — that is what took their TTFB from
// 2936ms to 5ms, and a server component reading cookies would silently make
// them dynamic again. So the shell stays static and the session is fetched
// after paint. Everywhere else the page is already dynamic and uses the
// server version, which has no flash.
const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  teacher: "Teacher",
  hod: "Head of department",
  principal: "Principal",
};

type Me = { signedIn: boolean; displayName?: string | null; role?: string };

export default function SessionBadgeClient() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: Me) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {
        // A failed check renders as signed-out, which is the safe direction:
        // it offers a sign-in rather than implying a session that may not
        // exist.
        if (!cancelled) setMe({ signedIn: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing until the answer arrives, rather than a "Sign in" that flips to a
  // name a moment later.
  if (!me) return null;

  if (!me.signedIn) {
    return (
      <Link
        href="/login"
        className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)]"
      >
        Sign in
      </Link>
    );
  }

  const name = me.displayName?.trim() || "Signed in";

  return (
    <div className="flex items-center gap-2.5">
      <span className="hidden text-sm text-[var(--muted)] sm:inline">
        {name}
        <span className="ml-2 opacity-70">{ROLE_LABEL[me.role ?? ""] ?? me.role}</span>
      </span>
      <span
        title={`${name} · ${ROLE_LABEL[me.role ?? ""] ?? me.role}`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-sm font-semibold text-white"
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
