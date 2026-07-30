-- One answer, counted once.
--
-- Both learning-analytics functions join practice attempts and assistant turns
-- to a ROSTER of (class_id, student_id). A student in two of a teacher's
-- sections appears in that roster twice, so every answer they give and every
-- question they ask is counted twice. Three sections, three times.
--
-- Caught on the real Insights page, where the numbers were exactly double:
--
--     truth                        page showed
--     4 correct of 13 answers  →   8 of 26
--     explain 28               →   Explain it 56
--     example 10               →   Give an example 20
--     askme 7                  →   Ask me questions 14
--     check 1                  →   Check my answer 2
--
-- THE PERCENTAGE HID IT. Numerator and denominator both double, so "31%" was
-- right while every count beside it was wrong — which is how this survived
-- until a student happened to be enrolled in two sections. In a school where a
-- pupil sits in six or eight classes, these figures would be inflated six or
-- eight fold, and still show a plausible percentage.
--
-- Two changes. The totals now join to a DISTINCT set of pupils, so a student is
-- one student however many of your classes they are in. And a section's figures
-- now require that the material actually REACHES that section — the old version
-- credited 7D with thirteen answers about magnets because the pupil was
-- enrolled there, when the magnets deck only ever went to 7C.
--
-- The role predicate is `in ('teacher', 'hod', 'principal')` here rather than
-- `= 'teacher'`, preserving what 0035 widened. Re-pasting a body from an older
-- migration is exactly how that kind of fix gets silently reverted, so it is
-- called out rather than assumed.

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
  -- The fix. One row per person, not per person-per-class, and students only —
  -- a teacher trying their own questions is not evidence about a class, the
  -- same rule 0029 applies to the progress table.
  pupils as (
    select distinct r.student_id
    from roster r
    join public.users u on u.id = r.student_id and u.role = 'student'
  ),
  graded as (
    select
      pa.student_id,
      c.document_id,
      (pa.graded_result->>'correct')::boolean as correct
    from public.practice_attempts pa
    join pupils p on p.student_id = pa.student_id
    join public.generated_questions q on q.id = pa.generated_question_id
    join public.corpus_chunks c on c.id = q.chunk_id
  ),
  -- A section's own figures. An attempt counts for a section only when the
  -- student is in it AND the document reaches it, so a section is credited with
  -- work on material its students were actually given.
  --
  -- These can still sum to more than the total when one deck serves two of a
  -- student's sections. That is deliberate: each row answers "how is THIS
  -- section doing", and the honest total is the overall block above.
  section_work as (
    select ds.class_id, g.student_id, g.correct
    from graded g
    join public.corpus_document_sections ds on ds.document_id = g.document_id
    join public.class_enrollments e
      on e.class_id = ds.class_id and e.student_id = g.student_id
    where ds.class_id in (select id from my_classes)
  ),
  turns as (
    select t.intent, cv.student_id
    from public.conversation_turns t
    join public.conversations cv on cv.id = t.conversation_id
    join pupils p on p.student_id = cv.student_id
    where t.role = 'user'
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
    'hardestTopics', coalesce((
      select jsonb_agg(jsonb_build_object('topic', name, 'attempts', attempts, 'correct', correct)
             order by correct::float / greatest(attempts, 1), attempts desc)
      from (
        -- Extension stripped, as everywhere else a document is named for a
        -- person to read. "Magnets and Electromagnets.pptx" is a file; the
        -- lesson is "Magnets and Electromagnets".
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

-- The same fault, school-wide. Worse here, because a school roster multiplies
-- across every subject a pupil takes: eight classes, eight times the answers.
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
  pupils as (
    select distinct r.student_id
    from roster r
    join public.users u on u.id = r.student_id and u.role = 'student'
  ),
  graded as (
    select pa.student_id, c.document_id, (pa.graded_result->>'correct')::boolean as correct
    from public.practice_attempts pa
    join pupils p on p.student_id = pa.student_id
    join public.generated_questions q on q.id = pa.generated_question_id
    join public.corpus_chunks c on c.id = q.chunk_id
  ),
  subject_work as (
    select sc.subject, sc.grade, g.correct
    from graded g
    join public.corpus_document_sections ds on ds.document_id = g.document_id
    join school_classes sc on sc.id = ds.class_id
    join public.class_enrollments e
      on e.class_id = ds.class_id and e.student_id = g.student_id
  ),
  turns as (
    select t.intent, cv.student_id
    from public.conversation_turns t
    join public.conversations cv on cv.id = t.conversation_id
    join pupils p on p.student_id = cv.student_id
    where t.role = 'user'
  )
  select jsonb_build_object(
    'overall', jsonb_build_object(
      'attempts', (select count(*) from graded),
      'correct', (select count(*) filter (where correct) from graded),
      'studentsEnrolled', (select count(*) from pupils),
      'studentsActive', (select count(distinct student_id) from graded)
    ),
    'bySubject', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', subject, 'grade', grade, 'attempts', attempts, 'correct', correct
      ) order by subject, grade)
      from (
        select w.subject, w.grade, count(*)::int as attempts,
               count(*) filter (where w.correct)::int as correct
        from subject_work w
        group by w.subject, w.grade
      ) s
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
