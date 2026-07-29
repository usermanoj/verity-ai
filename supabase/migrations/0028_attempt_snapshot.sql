-- Make a practice attempt readable forever, and stop counting staff as pupils.
--
-- Two defects found by auditing the real table rather than the code:
--
--   1. 16 of 26 attempts belong to the TEACHER previewing lessons. The route
--      that writes them was fixed to accept students only, but the rows it
--      had already written were never excluded, so every accuracy figure on
--      the Insights page was computed over staff and pupils together. The
--      reported 6/26 = 23% should have been 3/10 = 30%.
--
--   2. 15 attempts reference generated questions that no longer exist —
--      re-uploading a deck regenerates its questions, and the old attempt is
--      left pointing at nothing. A teacher cannot see what was asked, so the
--      row is both uncountable and unreadable.
--
-- The second is the same fault as conversations.topic_id before 0026: a
-- record that decays because the thing it referenced was replaced. The remedy
-- is the same — snapshot what was true at the time. A child's answer is
-- evidence about that child, and it must not become meaningless because a
-- teacher tidied their uploads.
--
-- Nothing is deleted here. The staff rows are excluded by the analytics
-- functions in 0029, which fixes the class of problem rather than this
-- instance of it: a filter cannot be forgotten the way a clean-up can.

alter table public.practice_attempts
  add column if not exists question_prompt text,
  add column if not exists question_level text,
  -- Which document the question came from, so an attempt survives the
  -- question being regenerated and can still be attributed to a lesson.
  add column if not exists document_id uuid references public.corpus_documents (id) on delete set null;

-- Backfill everything still resolvable. Attempts whose question is already
-- gone keep a null prompt — honest, and visibly different from one that was
-- never recorded.
update public.practice_attempts pa
set
  question_prompt = q.prompt,
  question_level = q.level,
  document_id = c.document_id
from public.generated_questions q
join public.corpus_chunks c on c.id = q.chunk_id
where pa.question_prompt is null
  and q.id = pa.generated_question_id;

create index if not exists practice_attempts_student_created_idx
  on public.practice_attempts (student_id, created_at desc);
