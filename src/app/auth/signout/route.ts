import { NextRequest, NextResponse } from "next/server";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  if (hasSupabase()) {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }
  // 303, not the default 307.
  //
  // 307 PRESERVES the request method, so the browser followed this redirect
  // by re-issuing POST / — and "/" is a page, which only answers GET. Every
  // sign-out therefore ended on "This page isn't working · HTTP ERROR 405",
  // for teachers and students alike. The session was genuinely cleared, so
  // the damage was entirely to trust: the last thing anyone saw on the way
  // out was a browser error page.
  //
  // 303 See Other exists for exactly this — it says the POST succeeded and
  // the result is a different resource, to be fetched with GET. It is the
  // canonical end of the POST-Redirect-GET pattern.
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
