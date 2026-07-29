-- What the class did not understand, and what they are confused by.
--
-- The Insights page could say how many questions exist and how hard they are.
-- It could not say which idea a class had failed to grasp, which is the only
-- question a teacher opens analytics to answer: what do I reteach on Monday.
--
-- Both functions return FACTS — counts, raw answers, headings. The rollups,
-- the rankings and the "is this enough evidence to say anything" judgements
-- are computed in TypeScript where they can be tested.

-- 1. Every question this teacher's students have attempted, with how it went
--    and what they actually chose when wrong.
--
-- Per QUESTION rather than pre-aggregated by concept: rolling up is a
-- judgement (how much evidence before a concept counts as failed?) and
-- belongs where it can be tested.
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
  -- Staff excluded at the source, the same way the progress function does it.
  -- A teacher trying their own questions is not evidence about a class.
  pupils as (
    select distinct u.id
    from public.class_enrollments e
    join mine on mine.class_id = e.class_id
    join public.users u on u.id = e.student_id and u.role = 'student'
  ),
  tries as (
    select
      pa.generated_question_id as qid,
      pa.student_id,
      pa.answer,
      coalesce((pa.graded_result->>'correct')::boolean, false) as correct
    from public.practice_attempts pa
    join pupils p on p.id = pa.student_id
    -- Orphaned attempts (question deleted before 0028 began snapshotting)
    -- carry no link to a chunk, so they cannot be attributed to a concept.
    -- Dropped here rather than counted against the wrong idea.
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
        -- What they picked when they got it wrong. An error rate says a class
        -- is stuck; the shared wrong answer says what they believe, and that
        -- is the thing a teacher actually reteaches.
        'wrongAnswers', s.wrong_answers,
        -- The option list, so a stored answer of "B" can be shown as the
        -- words the student saw.
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

-- 2. What students keep asking the assistant to explain.
--
-- Every competitor's analytics are downstream of assessment: a child has to
-- fail something before the system notices. The tutor transcript sees
-- confusion BEFORE anyone gets anything wrong, and it has been recorded since
-- logging shipped and shown to nobody.
--
-- Granularity is the lesson, not the concept: an "explain" turn carries no
-- chunk reference — only "check" does — so attributing it to a section would
-- be an invention. The repeat count is the sharper signal anyway: a student
-- pressing Explain three times in one sitting has told you the lesson did not
-- land, whatever they later score.
create or replace function public.teacher_asked_about()
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
  asks as (
    select
      c.id as conversation_id,
      c.student_id,
      coalesce(c.topic_title, 'Untitled lesson') as topic,
      count(*) filter (where t.intent in ('explain', 'example'))::int as help_presses
    from public.conversations c
    join pupils p on p.id = c.student_id
    join public.conversation_turns t on t.conversation_id = c.id and t.role = 'user'
    group by c.id, c.student_id, c.topic_title
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'topic', topic,
        'presses', total_presses,
        'students', students,
        -- The most any single student asked in one sitting. A mean hides the
        -- child who asked six times.
        'maxInOneSitting', max_presses,
        'repeatedStudents', repeated
      ) order by total_presses desc
    ),
    '[]'::jsonb
  )
  from (
    select
      topic,
      sum(help_presses)::int as total_presses,
      count(distinct student_id)::int as students,
      max(help_presses)::int as max_presses,
      count(distinct student_id) filter (where help_presses >= 3)::int as repeated
    from asks
    where help_presses > 0
    group by topic
  ) rolled;
$$;

revoke all on function public.teacher_asked_about() from public, anon;
grant execute on function public.teacher_asked_about() to authenticated;
