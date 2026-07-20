import { NextRequest, NextResponse } from "next/server";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  if (hasSupabase()) {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/", req.url));
}
