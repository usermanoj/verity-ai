import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uploadCorpusFile } from "@/lib/supabase/storage";
import { getOrCreateTeacherClass } from "@/lib/ingestion/class";
import { isSupportedExtension } from "@/lib/ingestion/extract";
import { ingestDocumentWorkflow } from "@/workflows/ingest-document";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Ingestion isn't configured for this deployment yet." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user || user.role !== "teacher") {
    return NextResponse.json({ error: "Only signed-in teachers can upload." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const subject = (form.get("subject") as string | null) || "Physics";
  const grade = (form.get("grade") as string | null) || "Grade 7";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!isSupportedExtension(ext)) {
    return NextResponse.json({ error: "Only .docx and .pdf files are supported today." }, { status: 400 });
  }

  const classId = await getOrCreateTeacherClass(user.id, user.schoolId, subject, grade);

  const { data: doc, error } = await supabaseAdmin()
    .from("corpus_documents")
    .insert({ class_id: classId, uploaded_by: user.id, source_file: file.name, status: "pending" })
    .select("id")
    .single();
  if (error || !doc) {
    return NextResponse.json({ error: "Failed to create document record." }, { status: 500 });
  }

  const storagePath = `${classId}/${doc.id}/${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadCorpusFile(storagePath, buffer, file.type || "application/octet-stream");

  // Executes asynchronously — extraction/chunking can take longer than a
  // single request should block for, and then suspends entirely (at zero
  // cost) until the teacher approves or rejects it.
  await start(ingestDocumentWorkflow, [doc.id, storagePath]);

  return NextResponse.json({ documentId: doc.id, status: "processing" });
}
