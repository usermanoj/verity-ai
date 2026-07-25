import { NextRequest, NextResponse } from "next/server";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
import { createSignedUploadUrl } from "@/lib/supabase/storage";
import { currentAcademicYear, parseSections } from "@/lib/ingestion/academic-year";
import { isSupportedExtension } from "@/lib/ingestion/extract";

export const runtime = "nodejs";

// A generous but bounded per-file cap. Unlike the old single-request upload
// route, this is no longer constrained by Vercel's ~4.5 MB function payload
// limit (bytes never pass through this route — see upload-complete.ts) —
// this is purely a cost/abuse bound now, not a platform ceiling.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

type FileMeta = { name: string; size: number };

// Step 1 of 2 for a direct-to-storage upload: authorise the teacher, create
// the document rows, and mint one signed upload URL per file. No file bytes
// are received here — the browser uploads straight to Supabase Storage next,
// then calls POST /api/ingest/upload-complete.
//
// All the database work is ONE call (teacher_upload_init, migration 0007).
// It previously took ~7 sequential round trips — the users row for the role
// gate, get-or-create the course, get-or-create each section, insert the
// documents, insert the section mappings — measured live at 2272ms of a
// 6680ms upload, all of it before the browser could send a single byte.
export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Ingestion isn't configured for this deployment yet." }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    subject?: string;
    grade?: string;
    academicYear?: string;
    sections?: string;
    files?: FileMeta[];
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const subject = body.subject || "Physics";
  const grade = body.grade || "Grade 7";
  const academicYear = (body.academicYear || "").trim() || currentAcademicYear();
  const sectionNames = parseSections(body.sections || "");
  const files = Array.isArray(body.files) ? body.files : [];

  if (files.length === 0) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  for (const file of files) {
    if (typeof file.name !== "string" || typeof file.size !== "number") {
      return NextResponse.json({ error: "Invalid file metadata." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `"${file.name}" is too large (max 100 MB).` }, { status: 400 });
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!isSupportedExtension(ext)) {
      return NextResponse.json(
        { error: `"${file.name}": only .docx, .pdf, .pptx and .txt files are supported today.` },
        { status: 400 },
      );
    }
  }

  if (sectionNames.length === 0) {
    return NextResponse.json({ error: "Enter at least one section (e.g. 7A, or 7A, 7B)." }, { status: 400 });
  }

  // User-scoped client: the function reads auth.uid() itself, so identity
  // comes from the caller's verified JWT and the role gate needs no separate
  // query of its own.
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("teacher_upload_init", {
    p_subject: subject,
    p_grade: grade,
    p_academic_year: academicYear,
    p_sections: sectionNames,
    p_files: files.map((f) => f.name),
  });
  if (error) {
    return NextResponse.json({ error: "Failed to create document records." }, { status: 500 });
  }

  const result = (data ?? {}) as { error?: string; documents?: { id: string; name: string }[] };
  if (result.error) {
    // "Not signed in" / wrong role are authorisation failures; a section owned
    // by another teacher is a conflict.
    const status = result.error.includes("managed by another teacher") ? 409 : 403;
    return NextResponse.json({ error: result.error }, { status });
  }

  const docs = result.documents ?? [];
  if (docs.length !== files.length) {
    return NextResponse.json({ error: "Failed to create document records." }, { status: 500 });
  }

  // Signed URLs are Storage API calls, not database ones, so they can't join
  // the RPC — but they're independent of each other and run in parallel.
  const results = await Promise.all(
    docs.map(async (doc, i) => {
      const file = files[i];
      const { path, signedUrl } = await createSignedUploadUrl(`${doc.id}/${file.name}`);
      return { name: file.name, documentId: doc.id, path, signedUrl };
    }),
  );

  return NextResponse.json({ files: results });
}
