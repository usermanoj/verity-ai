import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uploadCorpusFile } from "@/lib/supabase/storage";
import { resolveTeacherSections } from "@/lib/ingestion/class";
import { currentAcademicYear, parseSections } from "@/lib/ingestion/academic-year";
import { isSupportedExtension } from "@/lib/ingestion/extract";
import { ingestDocumentWorkflow } from "@/workflows/ingest-document";

export const runtime = "nodejs";

// Bounds cost/abuse now that real teachers (not just the founder) can upload.
// Curriculum .docx/.pdf are small; 20 MB is generous headroom without being
// open-ended.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Ingestion isn't configured for this deployment yet." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user || user.role !== "teacher") {
    return NextResponse.json({ error: "Only signed-in teachers can upload." }, { status: 403 });
  }

  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  const subject = (form.get("subject") as string | null) || "Physics";
  const grade = (form.get("grade") as string | null) || "Grade 7";
  const academicYear = ((form.get("academicYear") as string | null) || "").trim() || currentAcademicYear();
  const sectionNames = parseSections((form.get("sections") as string | null) || "");

  if (files.length === 0) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  // Validate every file up front so a bad one in the batch fails the whole
  // request cleanly, rather than half-importing.
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `"${file.name}" is too large (max 20 MB).` }, { status: 400 });
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
  const documentIds: string[] = [];

  for (const file of files) {
    const { data: doc, error } = await admin
      .from("corpus_documents")
      .insert({ uploaded_by: user.id, source_file: file.name, status: "pending" })
      .select("id")
      .single();
    if (error || !doc) {
      return NextResponse.json({ error: `Failed to create record for "${file.name}".` }, { status: 500 });
    }

    // Map the document to every section it applies to (the uploader's own).
    const { error: mapError } = await admin
      .from("corpus_document_sections")
      .insert(resolved.classIds.map((classId) => ({ document_id: doc.id, class_id: classId })));
    if (mapError) {
      return NextResponse.json({ error: `Failed to attach "${file.name}" to sections.` }, { status: 500 });
    }

    const storagePath = `${doc.id}/${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadCorpusFile(storagePath, buffer, file.type || "application/octet-stream");

    // Executes asynchronously — extraction/chunking can take longer than a
    // single request should block for, and then suspends entirely (at zero
    // cost) until the teacher approves or rejects it.
    await start(ingestDocumentWorkflow, [doc.id, storagePath]);
    documentIds.push(doc.id);
  }

  return NextResponse.json({ documentIds, status: "processing" });
}
