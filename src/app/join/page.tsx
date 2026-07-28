import Link from "next/link";
import JoinClass from "@/components/classes/JoinClass";
import SessionBadge from "@/components/SessionBadge";
import { requireSignedIn } from "@/lib/auth";

// Where a scanned QR lands.
//
// requireSignedIn preserves the code through the login round trip via `next`,
// so a student who is not signed in yet goes to SSO and comes back here with
// the code still in the URL — rather than authenticating successfully and
// arriving somewhere that has forgotten why they came.
export const dynamic = "force-dynamic";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  await requireSignedIn(`/join${code ? `?code=${encodeURIComponent(code)}` : ""}`);

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/subjects" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← My subjects</Link>
        <SessionBadge />
      </div>

      <h1 className="mb-1 text-2xl font-bold tracking-tight">Join a class</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Your teacher gives you this code once. After that your class material appears automatically.
      </p>

      <JoinClass initialCode={code ?? ""} />
    </main>
  );
}
