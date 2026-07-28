import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabaseAdmin, supabaseAdmin } from "@/lib/supabase/admin";
import { resolveSchoolId } from "@/lib/school";

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
    if (email) {
      const { data: grant } = await admin
        .from("staff_allowlist")
        .select("role, school_id")
        .eq("email", email)
        .maybeSingle();
      if (grant) {
        role = grant.role;
        schoolId = grant.school_id;
        isStaffGrant = true;
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
    } else if (isStaffGrant && existing.role !== role) {
      // Keep a staff member's role in sync with the allowlist on re-login,
      // but never downgrade a user who isn't on the allowlist — their role
      // may have been set deliberately outside it.
      await admin.from("users").update({ role }).eq("id", data.user.id);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
