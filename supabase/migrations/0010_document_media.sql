-- Verity AI — keep the diagrams that came with the deck
--
-- Apply AFTER 0001–0009.
--
-- Why: a teacher's slides carry real diagrams — field lines, domain arrows,
-- circuit sketches — drawn or chosen for this syllabus. Ingestion unzipped
-- each file, took the text out of its <a:t> runs, and discarded every image.
-- Students then read a lesson stripped of the pictures their teacher taught
-- with, while the app synthesised approximations of diagrams that were
-- already sitting in the upload.
--
-- These beat anything generated: accurate by construction, familiar from
-- class, and carrying no invention risk, so they take precedence over the
-- built-in interactives rather than competing with them.

create table if not exists public.corpus_document_media (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.corpus_documents (id) on delete cascade,
  -- Matches corpus_chunks' page numbering (text-bearing slides), which is how
  -- an image finds the section discussing it.
  page_or_section int not null,
  storage_path text not null,
  width int,
  height int,
  created_at timestamptz not null default now()
);

create index if not exists corpus_document_media_doc_idx
  on public.corpus_document_media (document_id, page_or_section);

-- Same posture as corpus_documents: RLS on with no policy, so only the
-- service role reaches it. Student access runs through the server, which
-- checks the document is approved and mints a short-lived signed URL —
-- school material must not become publicly fetchable by guessing a path.
alter table public.corpus_document_media enable row level security;
