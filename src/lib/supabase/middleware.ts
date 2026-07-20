import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// Standard Supabase middleware pattern: refresh the session once per
// navigation and write the updated cookies onto the response, so pages and
// route handlers downstream see a valid (non-expired) session. Only called
// from proxy.ts when hasSupabase() is true — see that file for the no-op path.
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Triggers a token refresh if the current access token is near expiry,
  // writing the refreshed session back to cookies via setAll above.
  await supabase.auth.getClaims();

  return response;
}
