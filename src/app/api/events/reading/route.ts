import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

// How far through a lesson a student has read.
//
// Students only. A teacher previewing their own material is not a pupil doing
// homework, and the two logging paths this codebase already has (attempts and
// tutor turns) both make that distinction — a third that did not would produce
// a figure nobody could explain.
//
// Always answers 200. A logging failure must never reach a child mid-lesson,
// and there is nothing useful the page could do with the error anyway.
//
// What arrives here is the set of sections seen so far, not a timing. See
// lib/reading.ts for why the finer measurement is deliberately not taken.

/** Longer than any real deck. A cap so a forged body cannot write a novel. */
const MAX_SECTIONS = 500;

export async function POST(req: NextRequest) {
  if (!hasSupabase()) return NextResponse.json({ logged: false });

  const user = await getCurrentAppUser();
  if (!user || user.role !== "student") return NextResponse.json({ logged: false });

  try {
    const body = (await req.json().catch(() => null)) as {
      topicId?: unknown;
      sections?: unknown;
      total?: unknown;
    } | null;

    const topicId = typeof body?.topicId === "string" ? body.topicId.slice(0, 100) : null;
    const total = typeof body?.total === "number" && Number.isFinite(body.total) ? Math.trunc(body.total) : 0;
    if (!topicId || total <= 0 || total > MAX_SECTIONS) return NextResponse.json({ logged: false });

    // Rebuilt rather than trusted: whole numbers, in range, unique, sorted, and
    // capped. The body comes from a page, and a page is not a source of facts
    // about a child.
    const raw = Array.isArray(body?.sections) ? body.sections : [];
    const sections = [
      ...new Set(
        raw
          .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
          .map((n) => Math.trunc(n))
          .filter((n) => n >= 0 && n < total),
      ),
    ]
      .sort((a, b) => a - b)
      .slice(0, MAX_SECTIONS);

    if (sections.length === 0) return NextResponse.json({ logged: false });

    const supabase = await supabaseServer();
    const { error } = await supabase.from("events").insert({
      user_id: user.id,
      type: "sections_read",
      payload: { topicId, sections, total },
    });
    if (error) {
      // Named, because engagement figures silently missing look exactly like
      // students not using the product — the failure this codebase keeps
      // rediscovering.
      console.error("[api/events/reading] insert rejected:", error.message);
      return NextResponse.json({ logged: false });
    }

    return NextResponse.json({ logged: true });
  } catch (err) {
    console.error("[api/events/reading] threw:", err);
    return NextResponse.json({ logged: false });
  }
}
