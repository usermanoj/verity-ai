import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { atLeast } from "@/lib/roles";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
import { reportError } from "@/lib/errors/report";

export const runtime = "nodejs";

// Changing which classes a deck reaches.
//
// Ownership is decided inside teacher_set_document_sections against auth.uid():
// your own upload, and only classes you teach. This route does not re-derive
// that rule — two answers to "is this mine" is how they drift apart, and the one
// that drifts is the one that puts a class's material in front of the wrong
// children.

const MESSAGES: Record<string, string> = {
  not_allowed: "Only a teacher can change where material goes.",
  not_found: "That material isn't yours to move.",
  not_your_class: "One of those sections isn't yours.",
};

export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Not configured for this deployment." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user || !atLeast(user.role, "teacher")) {
    return NextResponse.json({ error: MESSAGES.not_allowed }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { documentId?: string; classIds?: string[] } | null;
  if (!body?.documentId || !Array.isArray(body.classIds)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // An empty set is allowed and means "reaches nobody" — a teacher withdrawing
  // material from every class is a real thing to want, and refusing it would
  // leave removal impossible once the last section is gone.
  const classIds = body.classIds.filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id));
  if (classIds.length !== body.classIds.length) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc("teacher_set_document_sections", {
      p_document_id: body.documentId,
      p_class_ids: classIds,
    });
    if (error) throw error;

    const result = (data ?? {}) as { ok?: boolean; error?: string };
    if (!result.ok) {
      return NextResponse.json({ error: MESSAGES[result.error ?? ""] ?? "Couldn't save that." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    await reportError("ingest", err, "could not change a document's sections");
    return NextResponse.json({ error: "Something went wrong saving that. Please try again." }, { status: 500 });
  }
}
