-- Verity AI — real analytics for the teacher, HOD and principal dashboards
--
-- Apply AFTER 0001–0014.
--
-- What these deliberately do NOT report: anything about student learning.
--
-- practice_attempts and events are both written only for a signed-in user,
-- and student-facing pages are not auth-gated yet, so both tables are empty.
-- Every "engagement", "mastery" or "time on task" number a dashboard could
-- show today would be invented. The dashboards therefore report on CURRICULUM
-- READINESS, which is real, complete, and — during a rollout — the thing a
-- head of department actually needs: who has material live, where the gaps
-- are, and what is waiting on review.
--
-- One function per role, each returning a single jsonb document, for the same
-- reason the ingest screen uses one RPC: a dashboard that issues eight
-- queries pays eight round trips to a database in another region.

-- ─────────────────────────────────────────────────────────── teacher

create or replace function public.teacher_analytics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id, school_id from public.users where id = auth.uid() and role = 'teacher'
  ),
  docs as (
    select d.*
    from public.corpus_documents d, me
    where d.uploaded_by = me.id and d.superseded_at is null
  ),
  chunks as (
    select c.* from public.corpus_chunks c where c.document_id in (select id from docs)
  ),
  questions as (
    select q.* from public.generated_questions q where q.chunk_id in (select id from chunks)
  ),
  -- Sections this teacher owns, and whether each has approved material. A
  -- section with none is a class whose students currently have nothing.
  sections as (
    select
      cl.id,
      cl.section_name,
      co.subject,
      co.grade,
      exists (
        select 1
        from public.corpus_document_sections s
        join docs d2 on d2.id = s.document_id
        where s.class_id = cl.id and d2.status = 'approved'
      ) as has_material
    from public.classes cl
    join public.courses co on co.id = cl.course_id
    join me on me.id = cl.teacher_id
  ),
  -- Approved topics with no approved questions: a student can read the
  -- material but cannot practise it, which looks like a finished lesson and
  -- is not one.
  topics_without_questions as (
    select d.id, d.source_file
    from docs d
    where d.status = 'approved'
      and not exists (
        select 1 from public.generated_questions q2
        join public.corpus_chunks c2 on c2.id = q2.chunk_id
        where c2.document_id = d.id and q2.status = 'approved'
      )
  )
  select jsonb_build_object(
    'documents', jsonb_build_object(
      'total',    (select count(*) from docs),
      'approved', (select count(*) from docs where status = 'approved'),
      'pending',  (select count(*) from docs where status = 'pending'),
      'rejected', (select count(*) from docs where status = 'rejected')
    ),
    'sectionsLive', (select count(*) from chunks where approved_at is not null),
    'questions', jsonb_build_object(
      'approved', (select count(*) from questions where status = 'approved'),
      'pending',  (select count(*) from questions where status = 'pending'),
      'rejected', (select count(*) from questions where status = 'rejected')
    ),
    'byLevel', coalesce((
      select jsonb_agg(jsonb_build_object('level', level, 'count', n) order by level)
      from (select level, count(*)::int as n from questions where status = 'approved' group by level) x
    ), '[]'::jsonb),
    'byFormat', coalesce((
      select jsonb_agg(jsonb_build_object('format', kind, 'count', n) order by n desc)
      from (
        select coalesce(question->>'kind', 'unknown') as kind, count(*)::int as n
        from questions where status = 'approved' group by 1
      ) y
    ), '[]'::jsonb),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'section', section_name, 'subject', subject, 'grade', grade, 'hasMaterial', has_material
      ) order by subject, grade, section_name)
      from sections
    ), '[]'::jsonb),
    'topicsWithoutQuestions', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', source_file) order by source_file)
      from topics_without_questions
    ), '[]'::jsonb),
    -- Twelve weeks of activity, zero-filled, so the shape of a gap is as
    -- visible as the shape of a burst.
    'weekly', coalesce((
      select jsonb_agg(jsonb_build_object('week', to_char(w, 'YYYY-MM-DD'), 'count', n) order by w)
      from (
        select w.week as w, (select count(*) from docs d where date_trunc('week', d.created_at) = w.week)::int as n
        from (
          select generate_series(
            date_trunc('week', now()) - interval '11 weeks',
            date_trunc('week', now()),
            interval '1 week'
          ) as week
        ) w
      ) z
    ), '[]'::jsonb)
  )
  where exists (select 1 from me);
$$;

revoke all on function public.teacher_analytics() from public, anon;
grant execute on function public.teacher_analytics() to authenticated;

-- ────────────────────────────────────────────────── HOD / principal

-- School-wide, for the roles that oversee rather than teach. Scoped to the
-- caller's own school in every branch: an analytics function that forgets
-- that is a cross-tenant data leak wearing a chart.
create or replace function public.school_analytics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id, school_id from public.users
    where id = auth.uid() and role in ('hod', 'principal')
  ),
  staff as (
    select u.id, u.display_name
    from public.users u, me
    where u.school_id = me.school_id and u.role = 'teacher'
  ),
  docs as (
    select d.*
    from public.corpus_documents d
    where d.uploaded_by in (select id from staff) and d.superseded_at is null
  ),
  -- Every section in the school, with whether approved material reaches it.
  -- This is the coverage question: not "how much have we uploaded" but "how
  -- many classes have something".
  coverage as (
    select
      co.subject,
      co.grade,
      cl.id as class_id,
      exists (
        select 1
        from public.corpus_document_sections s
        join docs d2 on d2.id = s.document_id
        where s.class_id = cl.id and d2.status = 'approved'
      ) as covered
    from public.classes cl
    join public.courses co on co.id = cl.course_id
    join me on me.school_id = cl.school_id
  )
  select jsonb_build_object(
    'teachers', jsonb_build_object(
      'total', (select count(*) from staff),
      'contributing', (
        select count(distinct d.uploaded_by) from docs d where d.status = 'approved'
      )
    ),
    'documents', jsonb_build_object(
      'approved', (select count(*) from docs where status = 'approved'),
      'pending',  (select count(*) from docs where status = 'pending')
    ),
    'questionsPending', (
      select count(*) from public.generated_questions q
      join public.corpus_chunks c on c.id = q.chunk_id
      where c.document_id in (select id from docs) and q.status = 'pending'
    ),
    'coverage', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', subject, 'grade', grade, 'sections', total, 'covered', covered
      ) order by subject, grade)
      from (
        select subject, grade, count(*)::int as total, count(*) filter (where covered)::int as covered
        from coverage group by subject, grade
      ) c
    ), '[]'::jsonb),
    'byTeacher', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', coalesce(s.display_name, 'Unnamed teacher'),
        'approved', (select count(*) from docs d where d.uploaded_by = s.id and d.status = 'approved'),
        'pending', (select count(*) from docs d where d.uploaded_by = s.id and d.status = 'pending')
      ) order by (select count(*) from docs d where d.uploaded_by = s.id and d.status = 'approved') desc)
      from staff s
    ), '[]'::jsonb),
    'weekly', coalesce((
      select jsonb_agg(jsonb_build_object('week', to_char(w.week, 'YYYY-MM-DD'), 'count',
        (select count(*) from docs d where date_trunc('week', d.created_at) = w.week)::int
      ) order by w.week)
      from (
        select generate_series(
          date_trunc('week', now()) - interval '11 weeks',
          date_trunc('week', now()),
          interval '1 week'
        ) as week
      ) w
    ), '[]'::jsonb)
  )
  where exists (select 1 from me);
$$;

revoke all on function public.school_analytics() from public, anon;
grant execute on function public.school_analytics() to authenticated;
