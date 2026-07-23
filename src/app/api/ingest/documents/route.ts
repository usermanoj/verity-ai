import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { listTeacherDocuments } from "@/lib/ingestion/documents";

export const runtime = "nodejs";

// Timings are returned in the body (and as a Server-Timing header) so slow
// loads can be diagnosed from actual numbers rather than guesswork: they
// separate auth cost from query cost from payload size, which are three very
// different fixes. The panel renders them as a small line under the list.
export async function GET() {
  if (!hasSupabase()) {
    return NextResponse.json({ documents: [] });
  }

  const startedAt = Date.now();
  const user = await getCurrentAppUser();
  const authMs = Date.now() - startedAt;
  if (!user || user.role !== "teacher") {
    return NextResponse.json({ error: "Only signed-in teachers can view this." }, { status: 403 });
  }

  try {
    const queryStartedAt = Date.now();
    const documents = await listTeacherDocuments(user.id);
    const queryMs = Date.now() - queryStartedAt;

    const chunksShipped = documents.reduce((n, d) => n + d.chunks.length, 0);
    const body = JSON.stringify({
      documents,
      timings: {
        authMs,
        queryMs,
        serverMs: Date.now() - startedAt,
        documentCount: documents.length,
        chunksShipped,
      },
    });

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        "Server-Timing": `auth;dur=${authMs}, db;dur=${queryMs}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load documents." }, { status: 500 });
  }
}
