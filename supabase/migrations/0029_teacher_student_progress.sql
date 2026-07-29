-- Per-student progress for the teacher.
--
-- The Insights page was entirely aggregate — difficulty mix, formats,
-- accuracy by section. A teacher opening it on a Monday is asking "who is
-- stuck, who hasn't started, what did they get wrong", and not one of those
-- was answerable. The only place a pupil's name appeared anywhere in the
-- product was the reading-level list.
--
-- These functions return FACTS ONLY — counts, timestamps, raw outcomes. Every
-- judgement (is this child struggling? is this sample big enough to quote a
-- percentage?) is computed in TypeScript, where it can be unit-tested. A rule
-- buried in SQL is a rule nobody can test and everybody assumes.

-- Every student in a section this teacher owns, with what they have done.
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
    join public.users me on me.id = auth.uid() and me.role = 'teacher'
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

-- One student, in detail: what they got wrong, and what they asked.
create or replace function public.teacher_student_detail(p_student_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    -- Enrolled in a section this teacher owns. Not "same school": a teacher
    -- has no business reading another teacher's pupil's transcript.
    select 1
    from public.class_enrollments e
    join public.classes c on c.id = e.class_id
    join public.users me on me.id = auth.uid() and me.role = 'teacher'
    where e.student_id = p_student_id and c.teacher_id = auth.uid()
    limit 1
  )
  select jsonb_build_object(
    'allowed', exists (select 1 from allowed),
    'wrong', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', pa.id,
          -- The snapshot from 0028. Null means the question was deleted
          -- before snapshotting existed — shown as such rather than hidden,
          -- because a silently shorter list is a lie about how much a child
          -- got wrong.
          'prompt', pa.question_prompt,
          'level', pa.question_level,
          'answer', pa.answer,
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
