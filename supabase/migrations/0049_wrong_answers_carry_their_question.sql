-- Two more fields on each wrong answer, so a repeat can be recognised.
--
-- A student in this school answered "At the centre" four times to the same
-- question about where a magnet's field is strongest. The panel showed that as
-- four rows in a list, indistinguishable from four different mistakes — and
-- those mean opposite things. Four different mistakes is a child who has not
-- learned it; the same one four times is a child who has learned something and
-- it is wrong, which needs a correction rather than more practice.
--
-- Recognising a repeat needs two things the list did not carry:
--
--   questionId     without it, "zone" typed into two different
--                  fill-in-the-blanks looks like the same mistake twice
--   correctAnswer  so the teacher reads "they answer X, it is Y" in one line
--                  rather than opening the question to find out
--
-- Both already exist on the row. Nothing new is recorded; the grouping happens
-- in lib/misconceptions.ts, where the judgements — what counts as the same
-- answer, and how far apart two attempts must be to be two decisions — can be
-- read and argued with.
--
-- NOTE ON THE ROLE GATE. 0029 wrote this function with `me.role = 'teacher'`
-- and 0035 widened nine functions in place to include hod and principal.
-- Replacing this body from 0029's text would silently re-narrow it and lock a
-- head of department out of their own pupils — a regression with no error
-- message, discovered only by a teacher who could not see their class. The
-- widened list is used here deliberately.

create or replace function public.teacher_student_detail(p_student_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    -- Enrolled in a section this member of staff owns. Not "same school": a
    -- teacher has no business reading another teacher's pupil's transcript.
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
          -- Which question, so two identical answers can be told apart from
          -- one answer given twice.
          'questionId', pa.question_id,
          -- The snapshot from 0028. Null means the question was deleted
          -- before snapshotting existed — shown as such rather than hidden,
          -- because a silently shorter list is a lie about how much a child
          -- got wrong.
          'prompt', pa.question_prompt,
          'level', pa.question_level,
          'answer', pa.answer,
          -- Written by the grader at the time. Null for question kinds that
          -- do not record one, and the interface simply says less.
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
