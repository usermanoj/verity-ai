-- Showing what the child chose, in words.
--
-- The stored answer is their raw submission, and for a multiple choice that is
-- a letter. The panel was reading:
--
--   Answered "B" twice to the same question. The answer is "At the poles".
--
-- which is half a sentence: B is a position in a list the teacher cannot see.
-- Matching was worse — "0=8 Nm" says nothing about which term row 0 was.
--
-- The grader already resolved the chosen option to compare it; it simply threw
-- the result away. It now records it as graded_result.chosenAnswer, and this
-- returns it. The raw `answer` column is untouched: it is evidence about a
-- child and must not be rewritten, so the readable form sits beside it rather
-- than in place of it.
--
-- Two parts, and the second is why this is a migration rather than only a code
-- change: answers already given have no chosenAnswer, and for a multiple choice
-- the letter can still be resolved against the question that is on file.

-- 1. Backfill, where the question survives and the answer is a bare letter.
--
--    A..H covers every option list this generator produces. Anything else —
--    a typed option, a position, a question since regenerated — is left alone
--    rather than guessed at: showing a teacher the wrong option is worse than
--    showing them the letter they have now.
update public.practice_attempts pa
   set graded_result = pa.graded_result || jsonb_build_object(
         'chosenAnswer',
         (gq.question->'options')->>(ascii(upper(trim(pa.answer))) - ascii('A'))
       )
  from public.generated_questions gq
 where gq.id = pa.generated_question_id
   and gq.question->>'kind' = 'mcq'
   and pa.graded_result ? 'correctAnswer'
   and not (pa.graded_result ? 'chosenAnswer')
   and trim(pa.answer) ~ '^[A-Ha-h]$'
   and (gq.question->'options')->>(ascii(upper(trim(pa.answer))) - ascii('A')) is not null;

-- 2. Return it beside the answer itself.
create or replace function public.teacher_student_detail(p_student_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    -- The widened list from 0035, not 0029's `role = 'teacher'`. Narrowing it
    -- back would lock a head of department out of their own pupils with no
    -- error to notice.
    select 1
    from public.class_enrollments e
    join public.classes c on c.id = e.class_id
    join public.users me
      on me.id = auth.uid()
     and me.role in ('teacher', 'hod', 'principal')
    where e.student_id = p_student_id and c.teacher_id = auth.uid()
    limit 1
  )
  select jsonb_build_object(
    'allowed', exists (select 1 from allowed),
    'wrong', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', pa.id,
          'questionId', pa.question_id,
          'prompt', pa.question_prompt,
          'level', pa.question_level,
          -- Exactly what they submitted, never rewritten.
          'answer', pa.answer,
          -- The same choice in words, where the two differ. Null for a typed
          -- answer, which is already its own words, and for an older attempt
          -- whose question is gone.
          'chosenAnswer', pa.graded_result->>'chosenAnswer',
          'correctAnswer', pa.graded_result->>'correctAnswer',
          'at', pa.created_at
        ) order by pa.created_at desc
      )
      from public.practice_attempts pa
      where pa.student_id = p_student_id
        and exists (select 1 from allowed)
        and not coalesce((pa.graded_result->>'correct')::boolean, false)
      limit 50
    ), '[]'::jsonb),
    'transcript', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'role', t.role,
          'intent', t.intent,
          'text', left(t.text, 600),
          'at', t.created_at,
          'topic', c.topic_title
        ) order by t.created_at desc
      )
      from public.conversation_turns t
      join public.conversations c on c.id = t.conversation_id
      where c.student_id = p_student_id
        and exists (select 1 from allowed)
      limit 40
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.teacher_student_detail(uuid) from public, anon;
grant execute on function public.teacher_student_detail(uuid) to authenticated;
