-- Verity AI — ingestion pipeline storage bucket (Phase 1, task #23)
--
-- Same caveat as 0001_init.sql: not yet applied or tested against a real
-- Postgres/Storage instance. Apply after 0001_init.sql.

-- Private bucket for teacher-uploaded source files (PPTX/DOCX/PDF). No
-- public read policy is defined — every access goes through
-- src/lib/supabase/storage.ts using the service-role client, since the API
-- routes that call it already gate by requireRole("teacher", ...) before
-- ever touching storage. Simpler and safer than replicating that same
-- school/role scoping again as Storage-specific RLS policies.
insert into storage.buckets (id, name, public)
values ('corpus-uploads', 'corpus-uploads', false)
on conflict (id) do nothing;
