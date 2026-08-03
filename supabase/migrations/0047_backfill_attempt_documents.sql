-- Filling in the topic on answers already given.
--
-- practice_attempts.document_id has existed since 0028 and nothing has ever
-- written to it. Every one of the first thirty-two attempts in this school
-- stored null, and nobody noticed because nothing read the column — until the
-- per-topic breakdown in 0046 did, and would have shown every teacher an empty
-- panel forever.
--
-- The write is fixed in api/practice/attempt. This recovers what can still be
-- recovered: an attempt whose generated question survives can be traced back
-- through its chunk to the document it came from.
--
-- Deliberately does NOT touch rows it cannot attribute:
--
--   · the two seeded demo topics use hand-authored banks ("e1", "m1") that
--     reference no document at all — null is the correct answer there, not a
--     gap to be filled
--   · an attempt whose question was deleted by a re-upload is unattributable,
--     and inventing a topic for it would put a child's answer under a heading
--     it may not belong to
--
-- Both stay null and are simply left out of the per-topic figures, which is
-- what 0046 already does with them.
--
-- Safe to re-run: only rows that are still null are considered.

update public.practice_attempts pa
   set document_id = cc.document_id
  from public.generated_questions gq
  join public.corpus_chunks cc on cc.id = gq.chunk_id
 where pa.generated_question_id = gq.id
   and pa.document_id is null
   and cc.document_id is not null;
