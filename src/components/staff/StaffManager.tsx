"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StaffGrant } from "@/lib/staff-repo";
import { canRevoke, invitableRoles } from "@/lib/staff";
import type { AppRole } from "@/lib/auth";
import { PRESSABLE } from "@/lib/ui";

const ROLE_LABEL: Record<string, string> = {
  teacher: "Teacher",
  hod: "Head of department",
  principal: "Principal",
};

const ROLE_MEANS: Record<string, string> = {
  teacher: "Uploads material, approves questions, reads their own classes' transcripts.",
  hod: "Everything a teacher can do, across the department, and can add teachers.",
  principal: "Whole-school view, and can add anyone — including other principals.",
};

export default function StaffManager({ grants, actorRole }: { grants: StaffGrant[]; actorRole: AppRole }) {
  const router = useRouter();
  const roles = invitableRoles(actorRole);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[0] ?? "teacher");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  async function send(action: "invite" | "revoke", targetEmail: string, targetRole?: string) {
    setBusy(true);
    setError(null);
    setAdded(null);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email: targetEmail, role: targetRole }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't save that.");
        return;
      }
      if (action === "invite") {
        setEmail("");
        setAdded(targetEmail);
      }
      // Server Component reload, so the list is the database's answer rather
      // than something optimistically patched in here.
      router.refresh();
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const active = grants.filter((g) => !g.revokedAt);
  const past = grants.filter((g) => g.revokedAt);

  return (
    <div className="space-y-6">
      {roles.length > 0 && (
        <section className="rounded-3xl border border-[var(--border)] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">Add a colleague</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            They get this role the next time they sign in with that address. Nothing is emailed — send them the link
            yourself.
          </p>

          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) void send("invite", email, role);
            }}
          >
            <label className="flex-1 min-w-[15rem] text-xs text-[var(--muted)]">
              Their school email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@school.edu.sg"
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text)]"
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Role
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                className="mt-1 block rounded-xl border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--text)]"
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className={`rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 ${PRESSABLE}`}
            >
              {busy ? "Saving…" : "Add"}
            </button>
          </form>

          {/* Says what the role can actually do. "HOD" means nothing to someone
              deciding whether a colleague should have it, and this is a choice
              about who can read children's transcripts. */}
          <p className="mt-3 text-xs text-[var(--muted)]">{ROLE_MEANS[role]}</p>

          {error && <p className="mt-3 text-sm text-[var(--warn)]">{error}</p>}
          {added && (
            <p className="mt-3 text-sm text-[var(--good)]">
              Added {added}. They&apos;ll have access when they next sign in.
            </p>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">
          Staff · {active.length}
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nobody on the staff list yet.</p>
        ) : (
          <div className="space-y-2">
            {active.map((g) => (
              <div
                key={g.email}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {g.claimedName ?? g.email}
                    {g.isSelf && <span className="ml-2 text-[11px] text-[var(--muted)]">you</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--muted)]">
                    {g.claimedName ? `${g.email} · ` : ""}
                    {ROLE_LABEL[g.role] ?? g.role}
                    {/* An invitation nobody has taken up looks identical to a
                        working one unless it is said. A typo in an address
                        would otherwise sit here looking like a colleague. */}
                    {g.claimedAt ? " · signed in" : " · not signed in yet"}
                    {g.source === "bootstrap" && " · set by environment variable"}
                    {g.invitedBy && ` · added by ${g.invitedBy}`}
                  </div>
                </div>
                {canRevoke(actorRole, g) ? (
                  <button
                    onClick={() => void send("revoke", g.email)}
                    disabled={busy}
                    className={`rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--warn)] disabled:opacity-60 ${PRESSABLE}`}
                  >
                    Remove
                  </button>
                ) : (
                  <span className="text-[11px] text-[var(--muted)]">
                    {g.isSelf ? "can't remove yourself" : g.source === "bootstrap" ? "set in the environment" : "—"}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">
            Removed · {past.length}
          </h2>
          {/* Kept rather than deleted, so a school can answer "who had access to
              this class in March". */}
          <div className="space-y-2">
            {past.map((g) => (
              <div key={g.email} className="rounded-2xl border border-[var(--border)] px-4 py-3 opacity-60">
                <div className="text-sm">{g.claimedName ?? g.email}</div>
                <div className="mt-0.5 text-xs text-[var(--muted)]">
                  {ROLE_LABEL[g.role] ?? g.role} · removed {g.revokedAt?.slice(0, 10)}
                  {g.revokedBy && ` by ${g.revokedBy}`}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
