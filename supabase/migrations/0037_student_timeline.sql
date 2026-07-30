-- How one child actually worked, from timestamps already stored.
--
-- The per-student view answers "what did they get wrong" and "what did they
-- ask", as two separate lists sorted newest-first. What it cannot show is the
-- thing a teacher actually wants: the ORDER. Whether they asked for an
-- explanation and then got it right. Whether they sat for forty minutes or
-- fired off eight answers in ninety seconds the night before.
--
-- All of that is already in the database — practice_attempts.created_at and
-- conversation_turns.created_at — and none of it has ever been read together.
-- No new capture, no new consent surface: this is the same data, interleaved.
--
-- Deliberately NOT time-on-page. A tab left open on a bus reads as three hours
-- and a fast reader reads as four minutes, so a "time spent" figure is precise
-- and misleading at once — the worst combination for a number that might end up
-- in a report about a child. What is here is the gap between one action and the
-- next, which is bounded by observation rather than by assumption.
--
-- Returns FACTS in time order. Where a sitting starts and ends, whether help
-- worked, and what counts as rushing are judgements, and they live in
-- src/lib/timeline.ts where they can be tested and argued with.

create or replace function public.teacher_student_timeline(p_student_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    -- The same ownership rule as teacher_student_detail, deliberately spelled
    -- out again rather than shared: two answers to "is this my student" is how
    -- they drift apart, and the one that drifts is the one that leaks a child's
    -- work. Widened past 'teacher' by 0035; kept that way here.
    select 1
    from public.class_enrollments e
    join public.classes c on c.id = e.class_id
    join public.users me
      on me.id = auth.uid() and me.role in ('teacher', 'hod', 'principal')
    where e.student_id = p_student_id and c.teacher_id = auth.uid()
    limit 1
  ),
  events as (
    -- An answer. The prompt is the snapshot from 0028, so a question deleted
    -- since is still readable rather than a blank line in the middle of a
    -- sitting.
    select
      pa.created_at as at,
      'answer' as kind,
      coalesce(pa.graded_result->>'correct', 'false') = 'true' as correct,
      pa.question_prompt as label,
      pa.question_level as detail,
      coalesce(nullif(btrim(ch.heading), ''), 'Untitled section') as section,
      null::text as intent
    from public.practice_attempts pa
    left join public.generated_questions q on q.id = pa.generated_question_id
    left join public.corpus_chunks ch on ch.id = q.chunk_id
    where pa.student_id = p_student_id and exists (select 1 from allowed)

    union all

    -- A request to the assistant. Only the student's own turns: the replies are
    -- in the transcript already, and what matters to the shape of a sitting is
    -- when the child asked, not how long the answer was.
    select
      t.created_at as at,
      'ask' as kind,
      null::boolean as correct,
      coalesce(c.topic_title, 'Untitled lesson') as label,
      null::text as detail,
      null::text as section,
      t.intent
    from public.conversation_turns t
    join public.conversations c on c.id = t.conversation_id
    where c.student_id = p_student_id
      and t.role = 'user'
      and exists (select 1 from allowed)
  )
  select jsonb_build_object(
    'allowed', exists (select 1 from allowed),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'at', e.at,
          'kind', e.kind,
          'correct', e.correct,
          'label', e.label,
          'detail', e.detail,
          'section', e.section,
          'intent', e.intent
        ) order by e.at
      )
      -- Oldest first, because a sitting is read forwards. Every other list in
      -- this product is newest-first, and this one deliberately is not.
      from (select * from events order by at limit 400) e
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.teacher_student_timeline(uuid) from public, anon;
grant execute on function public.teacher_student_timeline(uuid) to authenticated;
