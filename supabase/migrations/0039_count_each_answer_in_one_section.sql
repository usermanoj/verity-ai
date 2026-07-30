-- An answer belongs to one section, and the overlap gets said out loud.
--
-- On the real data 7C reported 13 answers, 7D reported 13 answers, and the
-- total was 13. Both rows are individually true — those students did answer
-- thirteen — and a teacher reading down the column will still add them up.
--
-- 0036 fixed the roster fan-out and left this deliberately, with a comment
-- arguing each row answers "how is THIS section doing". That was defensible in
-- the abstract and looks wrong on a screen, which is the more important test.
--
-- THE HONEST DIFFICULTY: a practice attempt has no section. A pupil answered a
-- question from a deck, the deck reaches 7C and 7D, and they are enrolled in
-- both. There is no fact of the matter about which section the answer belongs
-- to, so any single attribution is an invention.
--
-- What this does is choose one deterministically — the section whose name sorts
-- first — and then SAY SO, rather than inventing quietly or double-counting
-- quietly. The overlap is reported alongside the figures so the interface can
-- name the students it applies to.
--
-- It is also usually a mistake worth seeing. A child normally sits in one
-- section per subject; being in two that receive the same deck is the shape of
-- a duplicated enrolment or a deck assigned too widely, and until now nothing
-- in the product would ever have mentioned it.

create or replace function public.teacher_learning_analytics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id from public.users
    where id = auth.uid() and role in ('teacher', 'hod', 'principal')
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
  pupils as (
    select distinct r.student_id
    from roster r
    join public.users u on u.id = r.student_id and u.role = 'student'
  ),
  graded as (
    select
      pa.id as attempt_id,
      pa.student_id,
      c.document_id,
      (pa.graded_result->>'correct')::boolean as correct
    from public.practice_attempts pa
    join pupils p on p.student_id = pa.student_id
    join public.generated_questions q on q.id = pa.generated_question_id
    join public.corpus_chunks c on c.id = q.chunk_id
  ),
  -- Every section an attempt could belong to: the student is in it and the
  -- material reaches it.
  candidates as (
    select g.attempt_id, g.student_id, g.correct, mc.id as class_id, mc.section_name
    from graded g
    join public.corpus_document_sections ds on ds.document_id = g.document_id
    join my_classes mc on mc.id = ds.class_id
    join public.class_enrollments e
      on e.class_id = mc.id and e.student_id = g.student_id
  ),
  -- One of them, chosen the same way every time. distinct on with a stable
  -- order, so the figure does not move between two page loads — a count that
  -- changes when nothing changed is worse than a count that is arbitrary.
  section_work as (
    select distinct on (attempt_id) attempt_id, student_id, correct, class_id
    from candidates
    order by attempt_id, section_name, class_id
  ),
  -- Who this affected, so the interface can explain the arithmetic rather than
  -- leaving a teacher to notice the columns do not add up.
  shared as (
    select
      c.student_id,
      array_agg(distinct c.section_name order by c.section_name) as sections
    from candidates c
    group by c.student_id
    having count(distinct c.class_id) > 1
  )
  select jsonb_build_object(
    'overall', jsonb_build_object(
      'attempts', (select count(*) from graded),
      'correct', (select count(*) filter (where correct) from graded),
      'studentsEnrolled', (select count(*) from pupils),
      'studentsActive', (select count(distinct student_id) from graded)
    ),
    'bySection', coalesce((
      select jsonb_agg(jsonb_build_object(
        'section', mc.section_name, 'subject', mc.subject, 'grade', mc.grade,
        'attempts', s.attempts, 'correct', s.correct,
        'enrolled', (select count(distinct r.student_id) from roster r where r.class_id = mc.id),
        'active', s.active
      ) order by mc.subject, mc.grade, mc.section_name)
      from my_classes mc
      left join lateral (
        select coalesce(count(*), 0)::int as attempts,
               coalesce(count(*) filter (where correct), 0)::int as correct,
               coalesce(count(distinct student_id), 0)::int as active
        from section_work w where w.class_id = mc.id
      ) s on true
    ), '[]'::jsonb),
    -- Named students, not a count: "1 student is in two sections" invites the
    -- question "which one", and the answer is the only actionable part.
    'sharedStudents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', coalesce(u.display_name, 'Student'),
        'sections', to_jsonb(sh.sections)
      ) order by u.display_name)
      from shared sh
      join public.users u on u.id = sh.student_id
    ), '[]'::jsonb),
    'hardestTopics', coalesce((
      select jsonb_agg(jsonb_build_object('topic', name, 'attempts', attempts, 'correct', correct)
             order by correct::float / greatest(attempts, 1), attempts desc)
      from (
        select regexp_replace(d.source_file, '\.[^.]+$', '') as name,
               count(*)::int as attempts,
               count(*) filter (where g.correct)::int as correct
        from graded g
        join public.corpus_documents d on d.id = g.document_id
        group by 1
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
      'studentsUsing', (select count(distinct student_id) from (
        select cv.student_id
        from public.conversation_turns t
        join public.conversations cv on cv.id = t.conversation_id
        join pupils p on p.student_id = cv.student_id
        where t.role = 'user'
      ) x),
      'intents', coalesce((
        select jsonb_agg(jsonb_build_object('intent', intent, 'count', n) order by n desc)
        from (
          select coalesce(t.intent, 'other') as intent, count(*)::int as n
          from public.conversation_turns t
          join public.conversations cv on cv.id = t.conversation_id
          join pupils p on p.student_id = cv.student_id
          where t.role = 'user'
          group by 1
        ) i
      ), '[]'::jsonb),
      'shortcutting', (
        select count(*) from (
          select cv.student_id,
                 count(*) filter (where t.intent in ('check', 'askme'))::float / greatest(count(*), 1) as ratio
          from public.conversation_turns t
          join public.conversations cv on cv.id = t.conversation_id
          join pupils p on p.student_id = cv.student_id
          where t.role = 'user'
          group by cv.student_id having count(*) >= 3
        ) s where ratio > 0.6
      )
    )
  )
  where exists (select 1 from me);
$$;

revoke all on function public.teacher_learning_analytics() from public, anon;
grant execute on function public.teacher_learning_analytics() to authenticated;
