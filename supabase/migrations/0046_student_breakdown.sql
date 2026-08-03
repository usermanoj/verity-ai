-- What one child is good at, and whether they are getting better.
--
-- The dashboards could already say a student was struggling. They could not say
-- what at: hardest topics existed only across a whole class, and a single "62%
-- overall" sends a teacher to a pupil without telling them what to teach. The
-- wrong-answer list showed each failure and never added them up into a subject.
--
-- Two reads, both over practice_attempts, which has carried document_id,
-- question_level and created_at since 0028. Nothing new is recorded about a
-- child to produce either — which is the point. The other way to build student
-- analytics is to log how long they look at a page, and that is surveillance of
-- a minor that scores a left-open tab as concentration.
--
-- The judgements live in TypeScript (lib/student-breakdown.ts): how many
-- answers before a topic may be called a weakness, how much movement counts as
-- improvement. This returns counts and lets that file decide, so the thresholds
-- can be argued over without a migration.

create or replace function public.teacher_student_breakdown(p_student_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    -- Enrolled in a section this member of staff owns. Not "same school": a
    -- teacher has no business reading another teacher's pupil. The role list
    -- matches the widening in 0035 — a head of department who teaches a
    -- section is still that section's teacher.
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
  )
  select jsonb_build_object(
    'allowed', exists (select 1 from allowed),

    -- Per topic. One approved document is one topic (see content-repo.ts), so
    -- the deck's filename is the name a teacher already uses for it.
    --
    -- Attempts whose document_id is null are older than 0028's snapshotting and
    -- cannot be attributed to anything; they are left out rather than pooled
    -- into a fictional "Other", which would be a topic no lesson matches.
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

    -- Per week, Monday-stamped. Every week with work in it, including the thin
    -- ones: the caller decides which are substantial enough to compare, and a
    -- query that silently dropped them would hide that a child did almost
    -- nothing for a fortnight.
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
