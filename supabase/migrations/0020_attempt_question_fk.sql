-- Verity AI — give practice attempts a real reference to their question
--
-- Apply AFTER 0001–0019.
--
-- practice_attempts.question_id is text with no foreign key, so an attempt
-- outlives the question it answered. Replacing a document cascades its
-- questions away and leaves the attempts behind, pointing at nothing: 14 of
-- them already exist here, and they drop silently out of every analytics
-- query, under-counting a class after any content replacement.
--
-- The obvious fix — convert the column to uuid and add the constraint — would
-- have broken something. The two seeded demo topics use hand-authored
-- practice banks whose ids are "e1", "m1", "c1", not uuids, and there are
-- already attempts recorded against them. Casting would fail, and dropping
-- those rows would silently end logging for the demo topics.
--
-- So the reference gets its own column. question_id stays as the loose
-- identifier that works for any source of questions; generated_question_id is
-- the constrained one, set only when the question came from the generator,
-- and it is what analytics joins on.

alter table public.practice_attempts
  add column if not exists generated_question_id uuid
  references public.generated_questions (id) on delete cascade;

create index if not exists practice_attempts_generated_question_idx
  on public.practice_attempts (generated_question_id);

-- Backfill: every existing attempt whose question_id is a uuid that still
-- resolves. The 14 orphans stay null, which is now an explicit "this question
-- is gone" rather than a join that quietly finds nothing.
update public.practice_attempts pa
set generated_question_id = q.id
from public.generated_questions q
where pa.generated_question_id is null
  and pa.question_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and q.id::text = pa.question_id;

-- ON DELETE CASCADE, not SET NULL, and the trade-off is worth stating.
--
-- Cascade means replacing a deck deletes the attempts against its questions,
-- so a class's answer count can go DOWN when a teacher re-uploads material.
-- SET NULL would preserve the count but leave rows that cannot be attributed
-- to any topic — a total that no breakdown adds up to, which is the shape of
-- a number nobody can act on.
--
-- Attempts against material that no longer exists are not evidence about the
-- material that does. Consistent figures are worth more here than larger ones.

-- ──────────────────────────────── analytics now join on the real reference

create or replace function public.teacher_learning_analytics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id from public.users where id = auth.uid() and role = 'teacher'
  ),
  my_classes as (
    select cl.id, cl.section_name, co.subject, co.grade
    from public.classes cl
    join public.courses co on co.id = cl.course_id
    join me on me.id = cl.teacher_id
  ),
  roster as (
    select e.class_id, e.student_id
    from public.class_enrollments e
    where e.class_id in (select id from my_classes)
  ),
  graded as (
    select
      r.class_id,
      r.student_id,
      c.document_id,
      (pa.graded_result->>'correct')::boolean as correct
    from public.practice_attempts pa
    join roster r on r.student_id = pa.student_id
    join public.generated_questions q on q.id = pa.generated_question_id
    join public.corpus_chunks c on c.id = q.chunk_id
  ),
  turns as (
    select t.intent, cv.student_id
    from public.conversation_turns t
    join public.conversations cv on cv.id = t.conversation_id
    join roster r on r.student_id = cv.student_id
    where t.role = 'user'
  )
  select jsonb_build_object(
    'overall', jsonb_build_object(
      'attempts', (select count(*) from graded),
      'correct', (select count(*) filter (where correct) from graded),
      'studentsEnrolled', (select count(distinct student_id) from roster),
      'studentsActive', (select count(distinct student_id) from graded)
    ),
    'bySection', coalesce((
      select jsonb_agg(jsonb_build_object(
        'section', mc.section_name, 'subject', mc.subject, 'grade', mc.grade,
        'attempts', s.attempts, 'correct', s.correct,
        'enrolled', (select count(*) from roster r where r.class_id = mc.id),
        'active', s.active
      ) order by mc.subject, mc.grade, mc.section_name)
      from my_classes mc
      left join lateral (
        select count(*)::int as attempts,
               count(*) filter (where correct)::int as correct,
               count(distinct student_id)::int as active
        from graded g where g.class_id = mc.id
      ) s on true
    ), '[]'::jsonb),
    'hardestTopics', coalesce((
      select jsonb_agg(jsonb_build_object('topic', name, 'attempts', attempts, 'correct', correct)
             order by correct::float / greatest(attempts, 1), attempts desc)
      from (
        select d.source_file as name, count(*)::int as attempts, count(*) filter (where g.correct)::int as correct
        from graded g
        join public.corpus_documents d on d.id = g.document_id
        group by d.source_file
        having count(*) >= 5
      ) t
    ), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', coalesce(u.display_name, 'Unnamed'), 'attempts', s.attempts, 'correct', s.correct
      ) order by s.correct::float / greatest(s.attempts, 1), s.attempts desc)
      from (
        select student_id, count(*)::int as attempts, count(*) filter (where correct)::int as correct
        from graded group by student_id having count(*) >= 3
      ) s
      join public.users u on u.id = s.student_id
    ), '[]'::jsonb),
    'assistant', jsonb_build_object(
      'studentsUsing', (select count(distinct student_id) from turns),
      'intents', coalesce((
        select jsonb_agg(jsonb_build_object('intent', intent, 'count', n) order by n desc)
        from (select coalesce(intent, 'other') as intent, count(*)::int as n from turns group by 1) i
      ), '[]'::jsonb),
      'shortcutting', (
        select count(*) from (
          select student_id,
                 count(*) filter (where intent in ('check', 'askme'))::float / greatest(count(*), 1) as ratio
          from turns group by student_id having count(*) >= 3
        ) s where ratio > 0.6
      )
    )
  )
  where exists (select 1 from me);
$$;

revoke all on function public.teacher_learning_analytics() from public, anon;
grant execute on function public.teacher_learning_analytics() to authenticated;

create or replace function public.school_learning_analytics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select school_id from public.users
    where id = auth.uid() and role in ('hod', 'principal')
  ),
  school_classes as (
    select cl.id, co.subject, co.grade
    from public.classes cl
    join public.courses co on co.id = cl.course_id
    join me on me.school_id = cl.school_id
  ),
  roster as (
    select e.class_id, e.student_id
    from public.class_enrollments e
    where e.class_id in (select id from school_classes)
  ),
  graded as (
    select r.class_id, r.student_id, c.document_id, (pa.graded_result->>'correct')::boolean as correct
    from public.practice_attempts pa
    join roster r on r.student_id = pa.student_id
    join public.generated_questions q on q.id = pa.generated_question_id
    join public.corpus_chunks c on c.id = q.chunk_id
  ),
  turns as (
    select t.intent, cv.student_id
    from public.conversation_turns t
    join public.conversations cv on cv.id = t.conversation_id
    join roster r on r.student_id = cv.student_id
    where t.role = 'user'
  )
  select jsonb_build_object(
    'overall', jsonb_build_object(
      'attempts', (select count(*) from graded),
      'correct', (select count(*) filter (where correct) from graded),
      'studentsEnrolled', (select count(distinct student_id) from roster),
      'studentsActive', (select count(distinct student_id) from graded)
    ),
    'bySubject', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', subject, 'grade', grade, 'attempts', attempts, 'correct', correct
      ) order by subject, grade)
      from (
        select sc.subject, sc.grade, count(g.*)::int as attempts,
               count(*) filter (where g.correct)::int as correct
        from school_classes sc
        join graded g on g.class_id = sc.id
        group by sc.subject, sc.grade
      ) s
    ), '[]'::jsonb),
    'hardestTopics', coalesce((
      select jsonb_agg(jsonb_build_object('topic', name, 'attempts', attempts, 'correct', correct)
             order by correct::float / greatest(attempts, 1), attempts desc)
      from (
        select d.source_file as name, count(*)::int as attempts, count(*) filter (where g.correct)::int as correct
        from graded g
        join public.corpus_documents d on d.id = g.document_id
        group by d.source_file
        having count(*) >= 10
      ) t
    ), '[]'::jsonb),
    'assistant', jsonb_build_object(
      'studentsUsing', (select count(distinct student_id) from turns),
      'intents', coalesce((
        select jsonb_agg(jsonb_build_object('intent', intent, 'count', n) order by n desc)
        from (select coalesce(intent, 'other') as intent, count(*)::int as n from turns group by 1) i
      ), '[]'::jsonb),
      'shortcutting', (
        select count(*) from (
          select student_id,
                 count(*) filter (where intent in ('check', 'askme'))::float / greatest(count(*), 1) as ratio
          from turns group by student_id having count(*) >= 3
        ) s where ratio > 0.6
      )
    )
  )
  where exists (select 1 from me);
$$;

revoke all on function public.school_learning_analytics() from public, anon;
grant execute on function public.school_learning_analytics() to authenticated;
