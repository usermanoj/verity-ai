import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabaseAdmin, supabaseAdmin } from "@/lib/supabase/admin";
import { resolveSchoolId } from "@/lib/school";
import { isBootstrapPrincipal } from "@/lib/bootstrap-staff";
import { reportError } from "@/lib/errors/report";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Provision the public.users row. Uses the service-role client because a
  // brand-new user has no row yet to satisfy any RLS policy that reads their
  // own row.
  //
  // Everything below MUST either provision or report. A signed-in user with
  // no public.users row is invisible to getCurrentAppUser(), so every gated
  // page redirects them to /login — they authenticate with Google, land back
  // on the sign-in screen, and try again forever. That is indistinguishable
  // from "sign-in is broken", which is why each failure now carries a reason
  // instead of silently falling through to the redirect at the bottom.
  //
  // Role comes from the staff_allowlist table (keyed by email): a
  // pre-approved teacher/hod/principal gets that role automatically;
  // everyone else defaults to student — least privilege. That table is the
  // seam a real "invite teacher" admin UI will later write to, replacing the
  // manual per-teacher SQL promotion the pilot started with.
  // The role that ends up on their row — from the allowlist for staff, or
  // whatever they already had. Used for the redirect below.
  let effectiveRole: string | null = null;

  if (hasSupabaseAdmin()) {
    const admin = supabaseAdmin();

    // DEFAULT_SCHOOL_ID is commented out in .env.local.example, so a setup
    // that follows the example verbatim has it unset — and used to skip
    // provisioning entirely. A single-school deployment doesn't need to be
    // told which school it is: with exactly one row there is no ambiguity to
    // resolve. Two or more is genuinely ambiguous and must be configured,
    // and guessing there would put a student in the wrong school's data.
    const defaultSchoolId = await resolveSchoolId(admin);
    if (!defaultSchoolId) {
      return NextResponse.redirect(`${origin}/login?error=no_school`);
    }

    const email = data.user.email?.toLowerCase() ?? null;
    const displayName =
      (data.user.user_metadata?.full_name as string | undefined) ?? data.user.email ?? null;

    let role: "student" | "teacher" | "hod" | "principal" = "student";
    let schoolId = defaultSchoolId;
    let isStaffGrant = false;
    // A withdrawn grant must actually take effect. Previously revocation marked
    // a row and nothing else, so a removed teacher kept their role forever.
    let isRevoked = false;
    if (email) {
      const { data: grant } = await admin
        .from("staff_allowlist")
        .select("role, school_id, revoked_at")
        .eq("email", email)
        .maybeSingle();
      if (grant && !grant.revoked_at) {
        role = grant.role;
        schoolId = grant.school_id;
        isStaffGrant = true;
      } else if (grant?.revoked_at) {
        isRevoked = true;
        schoolId = grant.school_id;
      }

      // The loop-breaker: a brand-new school's staff list can only be managed by
      // staff, so without this the first principal has to be inserted by hand.
      // Checked AFTER the allowlist and allowed to win, so removing an address
      // from the env var is not silently overridden by a stale row — and the row
      // is recorded as 'bootstrap' so the interface can say where it came from
      // and refuse to "revoke" something an env var controls.
      if (isBootstrapPrincipal(email)) {
        role = "principal";
        isStaffGrant = true;
        isRevoked = false;
        if (schoolId) {
          const { error: upsertError } = await admin
            .from("staff_allowlist")
            .upsert(
              { email, school_id: schoolId, role: "principal", source: "bootstrap", revoked_at: null, revoked_by: null },
              { onConflict: "email" },
            );
          if (upsertError) await reportError("auth", upsertError, "could not record a bootstrap principal");
        }
      }
    }

    const { data: existing } = await admin.from("users").select("role").eq("id", data.user.id).maybeSingle();
    if (!existing) {
      const { error: insertError } = await admin.from("users").insert({
        id: data.user.id,
        school_id: schoolId,
        role,
        sso_subject: data.user.id,
        display_name: displayName,
      });
      // Discarding this was what made the bug invisible: the row never
      // appeared, nothing was logged, and the only symptom was the login
      // page showing up again.
      if (insertError) {
        console.error("[auth/callback] could not provision user", insertError);
        return NextResponse.redirect(`${origin}/login?error=provisioning_failed`);
      }
      effectiveRole = role;
    } else if (isStaffGrant && existing.role !== role) {
      effectiveRole = role;
      // Keep a staff member's role in sync with the allowlist on re-login,
      // but never downgrade a user who isn't on the allowlist — their role
      // may have been set deliberately outside it.
      await admin.from("users").update({ role }).eq("id", data.user.id);
    } else if (isRevoked && existing.role !== "student") {
      // An EXPLICITLY withdrawn grant is the one case where downgrading is
      // right, and it is the difference between revocation meaning something
      // and revocation being a note in a table. Narrow on purpose: only a
      // revoked row does this, so anyone promoted deliberately outside the
      // allowlist keeps what they were given.
      //
      // revoke_staff already drops the role at the moment of withdrawal; this
      // catches the person who was mid-session when it happened.
      effectiveRole = "student";
      await admin.from("users").update({ role: "student" }).eq("id", data.user.id);
    } else {
      // The ordinary case, and the one that matters most: someone who already
      // has a row signing in again. Their existing role is the answer, and
      // missing this branch would have sent every returning teacher to the
      // student page.
      effectiveRole = existing.role;
    }
  }

  // Mark the invitation as taken up, so the staff page can tell a working
  // grant from one sent to an address nobody owns. Without this every row reads
  // "not signed in yet" forever, and a typo in an address sits there looking
  // exactly like a colleague who simply has not logged in.
  if (hasSupabaseAdmin() && effectiveRole && effectiveRole !== "student") {
    const email = data.user.email?.toLowerCase();
    if (email) {
      const { error: claimError } = await supabaseAdmin()
        .from("staff_allowlist")
        .update({ claimed_at: new Date().toISOString(), claimed_by: data.user.id })
        .eq("email", email)
        .is("claimed_at", null);
      if (claimError) await reportError("auth", claimError, "could not mark a staff invitation as taken up");
    }
  }

  // Land where this person belongs.
  //
  // "next" carries a real destination when they were sent to sign in from a
  // gated page — /join?code=…, a lesson URL — and that always wins. But a
  // plain sign-in from the landing page used to return them to the landing
  // page: signed in, and still looking at marketing copy with no indication
  // of where to go. The system knows their role; it should use it.
  const destination = next === "/" ? homeForRole(effectiveRole) : next;
  return NextResponse.redirect(`${origin}${destination}`);
}

function homeForRole(role: string | null): string {
  switch (role) {
    case "teacher":
      return "/teacher";
    case "hod":
      return "/hod";
    case "principal":
      return "/principal";
    // Students, and anyone whose row could not be read: /subjects is the
    // student home and is safe for everyone — it shows only what the viewer
    // is scoped to see.
    default:
      return "/subjects";
  }
}
