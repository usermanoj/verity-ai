import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
import { canInvite, normaliseEmail } from "@/lib/staff";
import { reportError } from "@/lib/errors/report";

export const runtime = "nodejs";

// Inviting and withdrawing staff access.
//
// Every check here is made again in SQL (0034). That is deliberate: this layer
// exists to give a person a useful message, and the functions exist to be the
// boundary. If they ever disagree, the database wins — which is the right way
// round, because this handler is the thing a future refactor can bypass.

const MESSAGES: Record<string, string> = {
  not_allowed: "You can't grant that role.",
  bad_role: "That isn't a staff role.",
  bad_email: "That doesn't look like an email address.",
  taken: "That address is already on another school's staff list.",
  not_found: "That address isn't on the staff list.",
  self: "You can't remove your own access.",
  bootstrap:
    "That principal is set by the BOOTSTRAP_PRINCIPAL_EMAILS environment variable, so removing them here wouldn't hold. Edit that value instead.",
};

export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Staff management isn't configured for this deployment." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user || (user.role !== "principal" && user.role !== "hod")) {
    // Same response for "not signed in" and "not senior enough": whether this
    // school has a staff page is not information a teacher needs.
    return NextResponse.json({ error: "Only a principal or head of department can manage staff." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { action?: string; email?: string; role?: string } | null;
  if (!body?.email || (body.action !== "invite" && body.action !== "revoke")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = normaliseEmail(body.email);
  if (!email) {
    return NextResponse.json({ error: MESSAGES.bad_email }, { status: 400 });
  }

  try {
    const supabase = await supabaseServer();

    if (body.action === "invite") {
      // Checked here so the message names the actual rule rather than reporting
      // a generic refusal from the database.
      if (!body.role || !canInvite(user.role, body.role)) {
        return NextResponse.json({ error: MESSAGES.not_allowed }, { status: 403 });
      }
      const { data, error } = await supabase.rpc("invite_staff", { p_email: email, p_role: body.role });
      if (error) throw error;
      const result = (data ?? {}) as { ok?: boolean; error?: string };
      if (!result.ok) {
        return NextResponse.json({ error: MESSAGES[result.error ?? ""] ?? "Couldn't add them." }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    const { data, error } = await supabase.rpc("revoke_staff", { p_email: email });
    if (error) throw error;
    const result = (data ?? {}) as { ok?: boolean; error?: string };
    if (!result.ok) {
      return NextResponse.json({ error: MESSAGES[result.error ?? ""] ?? "Couldn't remove them." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    await reportError("auth", err, `staff ${body.action} failed`);
    return NextResponse.json({ error: "Something went wrong saving that. Please try again." }, { status: 500 });
  }
}
