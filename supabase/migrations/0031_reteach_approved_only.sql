-- A retired question must not decide what a teacher reteaches on Monday.
--
-- 0030's teacher_question_outcomes() joins generated_questions with no filter
-- on status, which was invisible until questions started being retired. Ten
-- narrative questions were retired from the magnetism deck — they asked in
-- which century the Chinese wrote about magnetism, and which person used
-- magnets for surgery, none of which is physics (see
-- src/lib/questions/narrative.ts). Eight of the one live student's thirteen
-- practice attempts were on those ten.
--
-- Without this filter, "What to reteach" still reports "Early history of
-- magnetism — 8 attempts, 5 wrong" and it still clears the evidence floor. So
-- retiring the questions changed what students see and changed nothing about
-- what the teacher is told to do, which is the worse half of the bug.
--
-- The attempts themselves are NOT deleted and not hidden anywhere else. A
-- child's answer is a record of what that child did, and the student detail
-- panel still shows it. What changes is that it stops being treated as
-- evidence ABOUT A CONCEPT — because the question it answered was never about
-- that concept.
--
-- Superseded documents are deliberately NOT filtered here. Re-uploading a
-- deck marks the old copy superseded, and the answers students gave against it
-- are still answers about real physics. Dropping them would be the same decay
-- 0026 and 0028 were written to stop.

create or replace function public.teacher_question_outcomes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select cl.id as class_id
    from public.classes cl
    join public.users me on me.id = auth.uid() and me.role = 'teacher'
    where cl.teacher_id = auth.uid()
  ),
  pupils as (
    select distinct u.id
    from public.class_enrollments e
    join mine on mine.class_id = e.class_id
    join public.users u on u.id = e.student_id and u.role = 'student'
  ),
  -- Approved only, and the filter lives HERE rather than at the end so a
  -- retired question's attempts never reach the per-question rollup and
  -- cannot inflate an attempts count that is then compared to the floor.
  live_questions as (
    select id from public.generated_questions where status = 'approved'
  ),
  tries as (
    select
      pa.generated_question_id as qid,
      pa.student_id,
      pa.answer,
      coalesce((pa.graded_result->>'correct')::boolean, false) as correct
    from public.practice_attempts pa
    join pupils p on p.id = pa.student_id
    join live_questions lq on lq.id = pa.generated_question_id
    where pa.generated_question_id is not null
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'questionId', q.id,
        'prompt', q.prompt,
        'level', q.level,
        'chunkId', c.id,
        'heading', coalesce(nullif(btrim(c.heading), ''), 'Untitled section'),
        'document', regexp_replace(d.source_file, '\.[^.]+$', ''),
        'attempts', s.attempts,
        'wrong', s.wrong,
        'students', s.students,
        'wrongAnswers', s.wrong_answers,
        'options', coalesce(q.question->'options', '[]'::jsonb)
      )
    ),
    '[]'::jsonb
  )
  from (
    select
      qid,
      count(*)::int as attempts,
      count(*) filter (where not correct)::int as wrong,
      count(distinct student_id)::int as students,
      coalesce(
        jsonb_object_agg(answer, n) filter (where answer is not null and n is not null),
        '{}'::jsonb
      ) as wrong_answers
    from (
      select
        t.qid,
        t.student_id,
        t.correct,
        case when not t.correct then t.answer end as answer,
        case when not t.correct then count(*) over (partition by t.qid, t.answer) end as n
      from tries t
    ) counted
    group by qid
  ) s
  join public.generated_questions q on q.id = s.qid
  join public.corpus_chunks c on c.id = q.chunk_id
  join public.corpus_documents d on d.id = c.document_id;
$$;

revoke all on function public.teacher_question_outcomes() from public, anon;
grant execute on function public.teacher_question_outcomes() to authenticated;
