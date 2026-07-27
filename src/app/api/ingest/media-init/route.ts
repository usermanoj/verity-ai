import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSignedUploadUrl } from "@/lib/supabase/storage";

export const runtime = "nodejs";

// Signed upload URLs for the diagrams the browser pulled out of a .pptx.
//
// Separate from upload-init because the image count isn't known until the
// file has been unzipped, which happens in the browser after that call has
// already returned. Same shape as the deck upload: this route authorises,
// the bytes go straight from the browser to Storage.
const MAX_MEDIA_PER_DOCUMENT = 40;
const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Ingestion isn't configured for this deployment yet." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user || user.role !== "teacher") {
    return NextResponse.json({ error: "Only signed-in teachers can upload." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    documentId?: string;
    files?: { name: string; size: number }[];
  } | null;
  if (!body?.documentId || !Array.isArray(body.files) || body.files.length === 0) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // The document must be this teacher's. Without this, a caller could mint
  // write URLs under another teacher's document prefix.
  const { data: doc } = await supabaseAdmin()
    .from("corpus_documents")
    .select("id")
    .eq("id", body.documentId)
    .eq("uploaded_by", user.id)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const files = body.files.slice(0, MAX_MEDIA_PER_DOCUMENT).filter((f) => {
    if (typeof f.name !== "string" || typeof f.size !== "number") return false;
    if (f.size > MAX_MEDIA_BYTES) return false;
    // The client builds these names, but a path separator here would let a
    // crafted request write outside the document's own prefix.
    return /^[a-z0-9_-]+\.(png|jpg|jpeg|gif|webp)$/i.test(f.name);
  });
  if (files.length === 0) {
    return NextResponse.json({ files: [] });
  }

  const results = await Promise.all(
    files.map(async (file) => {
      const { path, signedUrl } = await createSignedUploadUrl(`${body.documentId}/media/${file.name}`);
      return { name: file.name, path, signedUrl };
    }),
  );

  return NextResponse.json({ files: results });
}
