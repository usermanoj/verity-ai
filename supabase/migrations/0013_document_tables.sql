-- Verity AI — keep the data tables that came with the deck
--
-- Apply AFTER 0001–0012.
--
-- Why: a PowerPoint table is a real grid, but its cells are ordinary
-- paragraphs, so reading a slide paragraph-by-paragraph dissolved it into
-- "Time in s Distance in m 0 50 1 50 2 50" — a run-on line that read as
-- gibberish to a student and forced a fragile regex downstream to guess the
-- grid back from prose.
--
-- The grid is now kept as a grid. Measured on the real Grade 7 decks: the
-- distance-time deck carries two of these, one of them the worked
-- distance/time/speed table the whole lesson is built around. None of the
-- three decks contains a native PowerPoint chart, so these tables are the
-- only real data in them — which makes them the only honest source for a
-- chart a student can read.

create table if not exists public.corpus_document_tables (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.corpus_documents (id) on delete cascade,
  -- Matches corpus_chunks' page numbering, which is how a table finds the
  -- section discussing it.
  page_or_section int not null,
  headers jsonb not null,
  rows jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists corpus_document_tables_doc_idx
  on public.corpus_document_tables (document_id, page_or_section);

-- Same posture as the rest of the corpus: RLS on with no policy, so only the
-- service role reaches it and student access runs through the server after it
-- has checked the document is approved.
alter table public.corpus_document_tables enable row level security;
