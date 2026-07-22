// The corpus-uploads bucket name, shared by server code (src/lib/supabase/
// storage.ts, which mints signed upload URLs with the service-role client)
// and the browser (IngestPanel.tsx, which uploads directly to Storage using
// those URLs). Kept in its own file with zero other imports so the client
// bundle never pulls in supabase/admin.ts (which reads SUPABASE_SERVICE_ROLE_KEY).
export const CORPUS_BUCKET = "corpus-uploads";
