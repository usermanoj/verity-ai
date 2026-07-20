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

  // First-time sign-in: provision a public.users row. Uses the service-role
  // client because a brand-new user has no row yet to satisfy any RLS
  // policy that reads their own row. Every new sign-in defaults to
  // role='student' — least privilege. Promoting someone to teacher/hod/
  // principal is a manual step (via the Supabase table editor) until a
  // real admin/invite UI exists — out of scope for a single-pilot-school
  // MVP (see ROADMAP.md's Phase 2 sequencing).
  const defaultSchoolId = process.env.DEFAULT_SCHOOL_ID;
  if (hasSupabaseAdmin() && defaultSchoolId) {
    await supabaseAdmin()
      .from("users")
      .upsert(
        {
          id: data.user.id,
          school_id: defaultSchoolId,
          role: "student",
          sso_subject: data.user.id,
          display_name: (data.user.user_metadata?.full_name as string | undefined) ?? data.user.email ?? null,
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
