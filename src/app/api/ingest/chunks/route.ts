import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { getDocumentChunks } from "@/lib/ingestion/documents";
import { atLeast } from "@/lib/roles";

export const runtime = "nodejs";

// Loads one document's chunk text on demand, when a teacher expands an
// approved/rejected deck. The list endpoint deliberately omits that text for
// collapsed documents — shipping every historical deck's full text on every
// page load was the bulk of the payload and never rendered.
export async function GET(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ chunks: [] });
  }

  const user = await getCurrentAppUser();
  if (!user || !atLeast(user.role, "teacher")) {
    return NextResponse.json({ error: "Only signed-in teachers can view this." }, { status: 403 });
  }

  const documentId = req.nextUrl.searchParams.get("documentId");
  if (!documentId) {
    return NextResponse.json({ error: "Missing documentId." }, { status: 400 });
  }

  try {
    const chunks = await getDocumentChunks(user.id, documentId);
    if (chunks === null) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }
    return NextResponse.json({ chunks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load chunks." },
      { status: 500 },
    );
  }
}
