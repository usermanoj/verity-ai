import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSignedUploadUrl } from "@/lib/supabase/storage";
import { resolveTeacherSections } from "@/lib/ingestion/class";
import { currentAcademicYear, parseSections } from "@/lib/ingestion/academic-year";
import { isSupportedExtension } from "@/lib/ingestion/extract";

export const runtime = "nodejs";

// A generous but bounded per-file cap. Unlike the old single-request upload
// route, this is no longer constrained by Vercel's ~4.5 MB function payload
// limit (bytes never pass through this route — see upload-complete.ts) —
// this is purely a cost/abuse bound now, not a platform ceiling.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

type FileMeta = { name: string; size: number };

// Step 1 of 2 for a direct-to-storage upload: validate the request and the
// teacher's sections, create the corpus_documents/corpus_document_sections
// rows, and mint one signed upload URL per file. No file bytes are received
// here — the client uploads directly to Supabase Storage next, then calls
// POST /api/ingest/upload-complete once each upload succeeds.
export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Ingestion isn't configured for this deployment yet." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user || user.role !== "teacher") {
    return NextResponse.json({ error: "Only signed-in teachers can upload." }, { status: 403 });
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

  // Sections are resolved once — every file in this upload applies to the
  // same set of the teacher's sections.
  const resolved = await resolveTeacherSections(user.id, user.schoolId, subject, grade, academicYear, sectionNames);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 409 });
  }

  const admin = supabaseAdmin();
  const results: { name: string; documentId: string; path: string; token: string }[] = [];

  for (const file of files) {
    const { data: doc, error } = await admin
      .from("corpus_documents")
      .insert({ uploaded_by: user.id, source_file: file.name, status: "pending" })
      .select("id")
      .single();
    if (error || !doc) {
      return NextResponse.json({ error: `Failed to create record for "${file.name}".` }, { status: 500 });
    }

    const { error: mapError } = await admin
      .from("corpus_document_sections")
      .insert(resolved.classIds.map((classId) => ({ document_id: doc.id, class_id: classId })));
    if (mapError) {
      return NextResponse.json({ error: `Failed to attach "${file.name}" to sections.` }, { status: 500 });
    }

    const storagePath = `${doc.id}/${file.name}`;
    const { path, token } = await createSignedUploadUrl(storagePath);
    results.push({ name: file.name, documentId: doc.id, path, token });
  }

  return NextResponse.json({ files: results });
}
