import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/supabase/config";
import { getCurrentAppUser } from "@/lib/auth";
import { sourceHash, DEFAULT_TARGET_LANG } from "@/lib/translate/memory";

export const runtime = "nodejs";

const MAX_LEN = 2000;

// Teacher corrections to generated Chinese: a glossary entry, or a stored
// translation.
//
// Ownership is NOT checked here. It is checked inside the SECURITY DEFINER
// functions, against auth.uid(), in one place — a route that decided for
// itself who owns a document would be a second answer to that question, and
// two answers is how they drift apart.
export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // Same shape as every other teacher-only route here (api/classes/code,
  // api/ingest/chunks) rather than a new helper.
  const user = await getCurrentAppUser();
  if (!user || user.role !== "teacher") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: {
    kind?: "glossary" | "translation";
    id?: string;
    en?: string;
    zh?: string;
    hidden?: boolean;
    documentId?: string;
    source?: string;
    translation?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = await supabaseServer();

  if (body.kind === "glossary") {
    if (!body.id) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    if ((body.en?.length ?? 0) > 300 || (body.zh?.length ?? 0) > 300) {
      return NextResponse.json({ error: "too_long" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("save_glossary_edit", {
      p_id: body.id,
      p_en: body.en ?? "",
      p_zh: body.zh ?? "",
      p_hidden: body.hidden ?? false,
    });
    if (error) {
      console.error("[api/language] glossary edit failed:", error);
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }
    // The function returns false for a document the caller does not own.
    if (!data) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ ok: true });
  }

  if (body.kind === "translation") {
    const { documentId, source, translation } = body;
    if (!documentId || !source || !translation?.trim()) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    if (source.length > MAX_LEN || translation.length > MAX_LEN) {
      return NextResponse.json({ error: "too_long" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("save_translation_correction", {
      p_document_id: documentId,
      // Hashed here, with the same normalisation the lookup uses, so a
      // correction always lands on the passage it was written for.
      p_source_hash: sourceHash(source),
      p_source_text: source,
      p_target_lang: DEFAULT_TARGET_LANG,
      p_translation: translation,
    });
    if (error) {
      console.error("[api/language] translation correction failed:", error);
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
