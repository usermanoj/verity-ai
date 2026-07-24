import { NextResponse } from "next/server";
import { hasSupabase } from "@/lib/supabase/config";
import { getTeacherIngestState } from "@/lib/ingestion/documents";

export const runtime = "nodejs";

// Timings are returned in the body (and as a Server-Timing header) so slow
// loads can be diagnosed from actual numbers rather than guesswork.
//
// authMs is now 0 by construction: the role gate used to be its own database
// query, but the RPC returns the caller's role alongside their documents, so
// the whole request is a single round trip.
export async function GET() {
  if (!hasSupabase()) {
    return NextResponse.json({ documents: [] });
  }

  const startedAt = Date.now();
  try {
    const { user, documents } = await getTeacherIngestState();
    const queryMs = Date.now() - startedAt;

    // Identity came from auth.uid() inside the function, so a null user means
    // no valid session — not a lookup failure.
    if (!user || user.role !== "teacher") {
      return NextResponse.json({ error: "Only signed-in teachers can view this." }, { status: 403 });
    }

    const chunksShipped = documents.reduce((n, d) => n + d.chunks.length, 0);
    const body = JSON.stringify({
      documents,
      timings: {
        authMs: 0,
        queryMs,
        serverMs: Date.now() - startedAt,
        documentCount: documents.length,
        chunksShipped,
      },
    });

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        "Server-Timing": `db;dur=${queryMs}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load documents." }, { status: 500 });
  }
}
