import { supabaseAdmin } from "./admin";

const BUCKET = "corpus-uploads";

// Uses the service-role client for both directions — the API routes that
// call this already gate by requireRole("teacher", ...) before ever
// touching storage, so there's no need to replicate that same school/role
// scoping again as Storage-specific RLS policies (see
// supabase/migrations/0002_ingestion_storage.sql).
export async function uploadCorpusFile(path: string, file: Buffer, contentType: string): Promise<void> {
  const { error } = await supabaseAdmin().storage.from(BUCKET).upload(path, file, { contentType, upsert: false });
  if (error) throw error;
}

export async function downloadCorpusFile(path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}
