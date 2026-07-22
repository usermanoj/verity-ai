import { supabaseAdmin } from "./admin";
import { CORPUS_BUCKET } from "@/lib/ingestion/bucket";

// Uses the service-role client for both directions — the API routes that
// call this already gate by requireRole("teacher", ...) before ever
// touching storage, so there's no need to replicate that same school/role
// scoping again as Storage-specific RLS policies (see
// supabase/migrations/0002_ingestion_storage.sql).
//
// Actual file bytes never pass through this module for uploads (see
// createSignedUploadUrl below) — Vercel's serverless functions have a hard
// ~4.5 MB request-body ceiling that a real slide deck routinely exceeds.
// Only the upload *authorization* is server-mediated; the bytes go straight
// from the browser to Supabase Storage using the signed URL/token, which
// `uploadToSignedUrl()`'s own docs confirm requires no Storage RLS policy
// (the token itself carries the one-time write permission) — so this stays
// consistent with the "no public Storage RLS, everything gated server-side"
// design, just with authorization decided before the byte transfer instead
// of wrapping it.
export async function createSignedUploadUrl(path: string): Promise<{ path: string; token: string }> {
  const { data, error } = await supabaseAdmin().storage.from(CORPUS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Failed to create signed upload URL");
  return { path: data.path, token: data.token };
}

export async function downloadCorpusFile(path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin().storage.from(CORPUS_BUCKET).download(path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}
