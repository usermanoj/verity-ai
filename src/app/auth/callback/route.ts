import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabaseAdmin, supabaseAdmin } from "@/lib/supabase/admin";

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
  // Role comes from the staff_allowlist table (keyed by email): a
  // pre-approved teacher/hod/principal gets that role automatically;
  // everyone else defaults to student — least privilege. That table is the
  // seam a real "invite teacher" admin UI will later write to, replacing the
  // manual per-teacher SQL promotion the pilot started with.
  const defaultSchoolId = process.env.DEFAULT_SCHOOL_ID;
  if (hasSupabaseAdmin() && defaultSchoolId) {
    const admin = supabaseAdmin();
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
      await admin.from("users").insert({
        id: data.user.id,
        school_id: schoolId,
        role,
        sso_subject: data.user.id,
        display_name: displayName,
      });
    } else if (isStaffGrant && existing.role !== role) {
      // Keep a staff member's role in sync with the allowlist on re-login,
      // but never downgrade a user who isn't on the allowlist — their role
      // may have been set deliberately outside it.
      await admin.from("users").update({ role }).eq("id", data.user.id);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
