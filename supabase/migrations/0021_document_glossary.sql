-- Per-document ESL glossary.
--
-- The hover glossary has always been a hand-written list of 14 terms in
-- src/data/corpus.ts, written for the two demo topics. On any real upload it
-- matched nothing, so the feature looked removed when it was merely silent —
-- a Magnets deck contains no "pivot" and no "gradient".
--
-- Vocabulary now belongs to the document it came from, extracted at ingestion
-- from that document's own text.
--
-- No separate approval workflow: a student cannot reach a lesson until the
-- teacher has approved the document, so the glossary inherits that gate. It
-- is teacher-visible for the same reason the chunks are.

create table if not exists public.corpus_glossary (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.corpus_documents(id) on delete cascade,
  term text not null,
  en text not null,
  zh text not null,
  created_at timestamptz not null default now()
);

-- One entry per term per document. Case-insensitive because the highlighter
-- matches case-insensitively: storing both "Solenoid" and "solenoid" would
-- put two identical tooltips on the same word.
create unique index if not exists corpus_glossary_document_term_idx
  on public.corpus_glossary (document_id, lower(term));

create index if not exists corpus_glossary_document_idx
  on public.corpus_glossary (document_id);

alter table public.corpus_glossary enable row level security;

-- Readable exactly where the material itself is readable. Anything else would
-- leak the vocabulary of a document the reader cannot open — which for a
-- glossary means leaking its subject matter.
drop policy if exists "glossary readable with its document" on public.corpus_glossary;
create policy "glossary readable with its document"
  on public.corpus_glossary for select
  using (
    exists (
      select 1 from public.corpus_documents d
      where d.id = corpus_glossary.document_id
        and d.status = 'approved'
    )
  );

-- Writes come from the ingestion pipeline via the service-role key, which
-- bypasses RLS; no insert/update policy is granted to anyone else.
