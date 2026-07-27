-- Verity AI — group a lesson into modules
--
-- Apply AFTER 0001–0011.
--
-- Why: chunking produces one section per concept, so a 44-slide deck becomes
-- 33 sections listed as peers. "Why insulation is used in a solenoid" is a
-- sub-point of how a solenoid works, not a sibling of "Early history of
-- magnetism" — but the page presented them at equal weight, and the contents
-- rail had to scroll sideways through all 33. Deck length was dictating
-- lesson structure.
--
-- A real lesson has five to eight movements. The chunker now names the part
-- each concept belongs to, and the page groups by it, so a student sees the
-- shape of the topic before its details.
--
-- Nullable on purpose: documents ingested before this keep working and simply
-- render flat, which is exactly what they do today.

alter table public.corpus_chunks
  add column if not exists module text;

-- Read on every lesson render, alongside the document filter already in use.
create index if not exists corpus_chunks_module_idx
  on public.corpus_chunks (document_id, module);
