import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";

export const runtime = "nodejs";
// Never cached: a stale answer here shows the previous account's name.
export const dynamic = "force-dynamic";

// Just enough to say who is signed in. No id, no email — this is read by a
// client component on a public page, so it returns only what is already
// displayed on screen.
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ signedIn: false });
  return NextResponse.json({ signedIn: true, displayName: user.displayName, role: user.role });
}
