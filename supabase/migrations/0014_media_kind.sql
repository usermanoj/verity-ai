-- Verity AI — tell a figure apart from a whole slide
--
-- Apply AFTER 0001–0013.
--
-- Why: PowerPoint draws many of its diagrams with native vector shapes rather
-- than embedded images — two slides in the Grade 7 magnetism deck are built
-- that way. Those are drawing instructions, not files, so unzipping the .pptx
-- can never reach them. Rendering the page is the only way to see them, and
-- the teacher's own browser can do it from a PDF export without the file
-- travelling anywhere new.
--
-- But a rendered page and an extracted figure are not the same thing. A
-- figure illustrates the text beside it and belongs inline; a whole slide
-- repeats the text and belongs behind a "show me the original" affordance,
-- or it would read as everything printed twice.
--
-- Existing rows are all extracted figures, which is what the default records.

alter table public.corpus_document_media
  add column if not exists kind text not null default 'figure'
  check (kind in ('figure', 'slide'));
