import Link from "next/link";
import { getCurrentAppUser } from "@/lib/auth";

// Who is signed in, and the way out.
//
// Neither was visible anywhere. A session survives a browser restart, so
// opening the site went straight past the landing page into the app with no
// indication of whose account it was — which reads as "no authentication"
// rather than "already authenticated". The only sign-out was a route with no
// link to it, so switching accounts meant clearing cookies by hand.
//
// Sign-out POSTs from a plain form rather than a link. A GET link returned
// 405, because the route only accepts POST — correctly: a signed-out user is
// a state change, and a change reachable by GET can be triggered by anything
// that renders a URL, including an <img> tag on another site.
const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  teacher: "Teacher",
  hod: "Head of department",
  principal: "Principal",
};

export default async function SessionBadge() {
  const user = await getCurrentAppUser();

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)]"
      >
        Sign in
      </Link>
    );
  }

  const name = user.displayName?.trim() || "Signed in";

  return (
    <div className="flex items-center gap-2.5">
      <span className="hidden text-sm text-[var(--muted)] sm:inline">
        {name}
        <span className="ml-2 opacity-70">{ROLE_LABEL[user.role] ?? user.role}</span>
      </span>
      <span
        title={`${name} · ${ROLE_LABEL[user.role] ?? user.role}`}
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
