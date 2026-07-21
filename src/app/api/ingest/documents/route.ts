import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { listTeacherDocuments } from "@/lib/ingestion/documents";

export const runtime = "nodejs";

export async function GET() {
  if (!hasSupabase()) {
    return NextResponse.json({ documents: [] });
  }

  const user = await getCurrentAppUser();
  if (!user || user.role !== "teacher") {
    return NextResponse.json({ error: "Only signed-in teachers can view this." }, { status: 403 });
  }

  const documents = await listTeacherDocuments(user.id);
  return NextResponse.json({ documents });
}
