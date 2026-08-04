-- A retired question is not evidence about a child.
--
-- 0031 established this and fixed exactly one function. Ten narrative
-- questions were retired from the magnetism deck — which century the Chinese
-- wrote about magnetism, which person used magnets for surgery — and the
-- reteach panel stopped counting them. Nothing else did.
--
-- Measured today, eight of one student's attempts are on those retired
-- questions. They still count towards:
--
--   the students list          attempts, accuracy, the last-ten sparkline
--   class attainment           the section and school figures
--   the per-topic breakdown    "Magnets 6/21 - needs reteaching"
--   the misconception finding  "answered First century three times"
--
-- The last is the worst. It reports a child as stuck on a belief, when the
-- question was one nobody should have asked — and a teacher acting on it would
-- reteach a piece of history that is not on the syllabus.
--
-- WHAT DOES NOT CHANGE, deliberately, following 0031: the attempts are not
-- deleted and the student detail panel still lists them. A child's answer is a
-- record of what that child did. What changes is that it stops being treated as
-- evidence ABOUT WHAT THEY UNDERSTAND, because the question it answered was
-- never about that.
--
-- An attempt whose question has been DELETED still counts. It was legitimate
-- when it was given, and dropping it would repeat the decay 0026 and 0028 were
-- written to stop. Only a question a teacher looked at and rejected is excluded.
--
-- A NOTE ON REPLAYING OLD FILES. 0035 rewrote nine functions in place to widen
-- their role gates, so several migration files on disk no longer match the
-- database. teacher_student_progress below is reconstructed from 0029 WITH the
-- widened gate; replaying 0029's own text would silently lock a head of
-- department out of their pupils, with no error to notice. Verified after
-- running by checking that a principal still sees their own pupil.

-- The rule, in one place, so the four call sites cannot drift apart.
--
-- True when an attempt should count towards what a child is said to
-- understand. Null generated_question_id means a hand-authored demo-bank
-- question or a row from before the column existed: counted, because there is
-- no teacher decision saying otherwise.
create or replace function public.attempt_is_evidence(p_generated_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_generated_question_id is null
      or not exists (
        select 1 from public.generated_questions gq
        where gq.id = p_generated_question_id and gq.status = 'rejected'
      );
$$;

revoke all on function public.attempt_is_evidence(uuid) from public, anon;
grant execute on function public.attempt_is_evidence(uuid) to authenticated;


-- Per-topic and per-week attainment (0046), now skipping retired questions.
create or replace function public.teacher_student_breakdown(p_student_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    select 1
    from public.class_enrollments e
    join public.classes c on c.id = e.class_id
    join public.users me
      on me.id = auth.uid()
     and me.role in ('teacher', 'hod', 'principal')
    where e.student_id = p_student_id and c.teacher_id = auth.uid()
    limit 1
  ),
  mine as (
    select pa.document_id,
           pa.created_at,
           coalesce((pa.graded_result->>'correct')::boolean, false) as correct
    from public.practice_attempts pa
    where pa.student_id = p_student_id
      and exists (select 1 from allowed)
      and public.attempt_is_evidence(pa.generated_question_id)
  )
  select jsonb_build_object(
    'allowed', exists (select 1 from allowed),
    'topics', coalesce((
      select jsonb_agg(t order by t->>'title')
      from (
        select jsonb_build_object(
                 'topicId', m.document_id,
                 'title', regexp_replace(d.source_file, '\.[^.]+$', ''),
                 'attempts', count(*),
                 'correct', count(*) filter (where m.correct)
               ) as t
        from mine m
        join public.corpus_documents d on d.id = m.document_id
        where m.document_id is not null
        group by m.document_id, d.source_file
      ) rows
    ), '[]'::jsonb),
    'weekly', coalesce((
      select jsonb_agg(w order by w->>'week')
      from (
        select jsonb_build_object(
                 'week', to_char(date_trunc('week', m.created_at), 'YYYY-MM-DD'),
                 'attempts', count(*),
                 'correct', count(*) filter (where m.correct)
               ) as w
        from mine m
        group by date_trunc('week', m.created_at)
      ) rows
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.teacher_student_breakdown(uuid) from public, anon;
grant execute on function public.teacher_student_breakdown(uuid) to authenticated;

-- The students list (0029, widened by 0035). Attempts and the sparkline now
-- skip retired questions.
create or replace function public.teacher_student_progress()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select cl.id as class_id, cl.section_name
    from public.classes cl
    join public.users me on me.id = auth.uid() and me.role in ('teacher', 'hod', 'principal')
    where cl.teacher_id = auth.uid()
  ),
  roster as (
    select distinct e.student_id
    from public.class_enrollments e
    join mine on mine.class_id = e.class_id
  ),
  -- Staff are excluded HERE, once, rather than trusted not to appear. The
  -- write path already refuses non-students; this makes the read immune to
  -- rows written before it did.
  pupils as (
    select u.id, coalesce(u.display_name, 'Student') as name, u.esl_level, u.esl_chinese
    from public.users u
    join roster r on r.student_id = u.id
    where u.role = 'student'
  ),
  work as (
    select
      pa.student_id,
      count(*)::int as attempts,
      count(*) filter (where (pa.graded_result->>'correct')::boolean) ::int as correct,
      max(pa.created_at) as last_attempt
    from public.practice_attempts pa
    join pupils p on p.id = pa.student_id
    where public.attempt_is_evidence(pa.generated_question_id)
    group by pa.student_id
  ),
  -- The last ten outcomes, oldest first, for a sparkline. A total tells you
  -- where a child is; a sequence tells you which way they are going.
  recent as (
    select student_id, jsonb_agg(correct order by created_at) as marks
    from (
      select
        pa.student_id,
        pa.created_at,
        (pa.graded_result->>'correct')::boolean as correct,
        row_number() over (partition by pa.student_id order by pa.created_at desc) as rn
      from public.practice_attempts pa
      join pupils p on p.id = pa.student_id
      where public.attempt_is_evidence(pa.generated_question_id)
    ) ranked
    where rn <= 10
    group by student_id
  ),
  talk as (
    select
      c.student_id,
      count(*) filter (where t.role = 'user')::int as messages,
      max(t.created_at) as last_message,
      jsonb_object_agg(coalesce(t.intent, 'other'), n) filter (where t.intent is not null) as intents
    from public.conversations c
    join pupils p on p.id = c.student_id
    join lateral (
      select ct.role, ct.intent, ct.created_at, count(*) over (partition by ct.intent) as n
      from public.conversation_turns ct
      where ct.conversation_id = c.id and ct.role = 'user'
    ) t on true
    group by c.student_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'eslLevel', p.esl_level,
        'eslChinese', p.esl_chinese,
        'sections', coalesce((
          select array_agg(distinct m.section_name order by m.section_name)
          from public.class_enrollments e
          join mine m on m.class_id = e.class_id
          where e.student_id = p.id
        ), array[]::text[]),
        'attempts', coalesce(w.attempts, 0),
        'correct', coalesce(w.correct, 0),
        'lastAttemptAt', w.last_attempt,
        'recent', coalesce(r.marks, '[]'::jsonb),
        'tutorMessages', coalesce(tk.messages, 0),
        'lastTutorAt', tk.last_message,
        'intents', coalesce(tk.intents, '{}'::jsonb)
      ) order by p.name
    ),
    '[]'::jsonb
  )
  from pupils p
  left join work w on w.student_id = p.id
  left join recent r on r.student_id = p.id
  left join talk tk on tk.student_id = p.id;
$$;

revoke all on function public.teacher_student_progress() from public, anon;
grant execute on function public.teacher_student_progress() to authenticated;

-- Class attainment (0039). The join to generated_questions was already there.
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
    -- A retired question is not evidence about a concept. See 0031, which
    -- made this same fix for the reteach panel and nowhere else.
    where q.status = 'approved'
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

-- The wrong-answer list (0050). Retired attempts STAY — they are a record of
-- what the child did, and 0031 was explicit that this panel keeps showing them.
-- They are flagged instead, so the misconception finding can leave them out: a
-- repeated answer to a question nobody should have asked is not a belief worth
-- correcting, and reporting it would send a teacher to reteach a piece of
-- history that is not on the syllabus.
create or replace function public.teacher_student_detail(p_student_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
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
          'answer', pa.answer,
          'chosenAnswer', pa.graded_result->>'chosenAnswer',
          'correctAnswer', pa.graded_result->>'correctAnswer',
          -- The teacher withdrew this question after it was answered.
          'retired', not public.attempt_is_evidence(pa.generated_question_id),
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
