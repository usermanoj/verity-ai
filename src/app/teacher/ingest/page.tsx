import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { listTeacherDocuments } from "@/lib/ingestion/documents";
import IngestPanel from "@/components/teacher/IngestPanel";

export default async function TeacherIngestPage() {
  const user = await requireRole("teacher", "/teacher/ingest");
  const initialDocuments = user ? await listTeacherDocuments(user.id) : [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/teacher" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Teacher dashboard</Link>
        <span className="rounded-full bg-[rgba(99,102,241,0.18)] px-3 py-1 text-sm text-[var(--brand2)]">📤 Upload material</span>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">Add curriculum material</h1>
      <p className="mt-1 text-[var(--muted)]">
        Upload one or more .docx, .pdf, .pptx or .txt files — each gets split into cited chunks for you to review
        before students ever see it.
      </p>

      {!hasSupabase() ? (
        <div className="glass mt-8 rounded-3xl p-6 text-sm text-[var(--muted)]">
          Uploads aren&apos;t configured for this deployment yet — Supabase env vars aren&apos;t set.
        </div>
      ) : (
        <div className="mt-8">
          <IngestPanel initialDocuments={initialDocuments} />
        </div>
      )}
    </main>
  );
}
