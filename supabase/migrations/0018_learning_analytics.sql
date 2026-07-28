-- Verity AI — learning analytics
--
-- Apply AFTER 0001–0017.
--
-- The dashboards have carried panels marked "Not yet available" since they
-- were rebuilt, because practice_attempts, events and conversations were all
-- empty: nothing knew who a student was. Students now sign in, join a class,
-- and are logged. These functions read what that produced.
--
-- A deliberate line runs through this file: a TEACHER sees named students,
-- because they teach them and cannot help a child they cannot identify. A
-- HOD or principal sees aggregates only. Naming individual children on a
-- school-wide screen is a different thing from a class list, and nothing on
-- an oversight dashboard needs it.
--
-- practice_attempts.question_id is text holding a generated_questions uuid,
-- so every join below casts rather than assuming a type that was never
-- declared.

-- ─────────────────────────────────────────────────────────────── teacher

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
  -- Every attempt by a student in one of this teacher's classes, tagged with
  -- the class and the document it came from.
  graded as (
    select
      r.class_id,
      r.student_id,
      c.document_id,
      (pa.graded_result->>'correct')::boolean as correct
    from public.practice_attempts pa
    join roster r on r.student_id = pa.student_id
    join public.generated_questions q on q.id::text = pa.question_id
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
    -- Lowest accuracy first, and only where enough attempts exist to mean
    -- anything: a topic answered twice is noise, not a weakness.
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
    -- Named, because a teacher cannot help a student they cannot identify.
    -- Ordered worst-first, since that is the list they act on.
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
      -- The claim this product is sold on: is the assistant being used to
      -- learn, or to get the answer? "explain" and "example" are learning;
      -- "check" is asking whether an answer is right. A student whose use is
      -- mostly the latter is the one to look at.
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

-- ────────────────────────────────────────────────────── HOD / principal

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
    join public.generated_questions q on q.id::text = pa.question_id
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
    -- No student names. A head of department oversees a department; nothing
    -- on this screen is improved by naming a child, and a screen that names
    -- them is a screen that gets shown in a meeting.
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
