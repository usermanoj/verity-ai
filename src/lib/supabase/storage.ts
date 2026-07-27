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
// Returns the complete signedUrl (token already embedded) as well, so the
// browser can PUT straight to it with a plain fetch and doesn't need to load
// @supabase/supabase-js at all — that library pulled a 244 kB client chunk
// (GoTrue + Realtime, both unused here) into this route, which had to
// download and parse before the page could hydrate.
export async function createSignedUploadUrl(
  path: string,
): Promise<{ path: string; token: string; signedUrl: string }> {
  const { data, error } = await supabaseAdmin().storage.from(CORPUS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Failed to create signed upload URL");
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

// Read URLs for diagrams lifted out of a deck. The bucket stays private —
// school material must not be fetchable by guessing a path — so students get
// a short-lived signed link minted per request, after the server has checked
// the document is approved.
export async function createSignedReadUrls(paths: string[], expiresInSeconds = 3600): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data, error } = await supabaseAdmin()
    .storage.from(CORPUS_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);
  if (error) throw error;

  const byPath = new Map<string, string>();
  for (const entry of data ?? []) {
    // createSignedUrls reports per-file failures inline rather than throwing;
    // a missing image should cost that one diagram, not the whole lesson.
    if (entry.signedUrl && entry.path) byPath.set(entry.path, entry.signedUrl);
  }
  return byPath;
}

export async function downloadCorpusFile(path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin().storage.from(CORPUS_BUCKET).download(path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}
