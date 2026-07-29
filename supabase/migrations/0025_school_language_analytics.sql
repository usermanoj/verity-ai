-- Language support across the school, for a HOD or principal.
--
-- Every piece of this exists already at the level below: a teacher sets a
-- child's reading level, and corrects the Chinese the model writes. None of it
-- rolls up. A head of department can see coverage and progress but not that a
-- third of Grade 7 is reading at the easiest level with Chinese glosses —
-- which is exactly the signal a school buys this product to get, and exactly
-- the one that decides where to put a teaching assistant.
--
-- Two things are reported, deliberately:
--
--   1. Where students actually are. Including how many nobody has assessed,
--      because a default is not a judgement and a report that hides that
--      difference is a report that flatters the school.
--
--   2. How much of the AI's Chinese teachers are correcting. That is a
--      quality signal about this product, and a school is entitled to it.
--      Hiding it would be marking our own homework.

create or replace function public.school_language_analytics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    -- Same gate as school_learning_analytics: this is a leadership view, and
    -- a teacher already has the per-student version of it.
    select school_id from public.users
    where id = auth.uid() and role in ('hod', 'principal')
  ),
  students as (
    select
      u.id,
      u.esl_level,
      u.esl_chinese,
      u.esl_set_by is not null as assessed
    from public.users u
    join me on me.school_id = u.school_id
    where u.role = 'student'
  ),
  -- Per section, so a head can see which classes concentrate the need rather
  -- than only a school-wide average that describes nobody.
  by_section as (
    select
      co.grade,
      cl.section_name,
      co.subject,
      count(distinct s.id) as students,
      count(distinct s.id) filter (where s.esl_level = 'beginner') as beginner,
      count(distinct s.id) filter (where s.esl_chinese) as chinese,
      count(distinct s.id) filter (where not s.assessed) as unassessed
    from public.classes cl
    join public.courses co on co.id = cl.course_id
    join me on me.school_id = cl.school_id
    join public.class_enrollments e on e.class_id = cl.id
    join students s on s.id = e.student_id
    group by co.grade, cl.section_name, co.subject
    having count(distinct s.id) > 0
  ),
  corrections as (
    select
      count(*) filter (where g.edited_at is not null) as glossary_edited,
      count(*) as glossary_total
    from public.corpus_glossary g
    join public.corpus_documents d on d.id = g.document_id
    join public.users u on u.id = d.uploaded_by
    join me on me.school_id = u.school_id
  ),
  translations as (
    select
      count(*) filter (where t.origin = 'teacher') as corrected,
      count(*) as total
    from public.translation_memory t
    join public.corpus_documents d on d.id = t.document_id
    join public.users u on u.id = d.uploaded_by
    join me on me.school_id = u.school_id
  )
  select jsonb_build_object(
    'students', (select count(*) from students),
    'levels', jsonb_build_object(
      'advanced', (select count(*) from students where esl_level = 'advanced'),
      'intermediate', (select count(*) from students where esl_level = 'intermediate'),
      'beginner', (select count(*) from students where esl_level = 'beginner')
    ),
    'chinese', (select count(*) from students where esl_chinese),
    'unassessed', (select count(*) from students where not assessed),
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'grade', grade,
          'section', section_name,
          'subject', subject,
          'students', students,
          'beginner', beginner,
          'chinese', chinese,
          'unassessed', unassessed
        )
        -- Heaviest need first: the list is read to decide where help goes.
        order by beginner::numeric / greatest(students, 1) desc, grade, section_name
      )
      from by_section
    ), '[]'::jsonb),
    'glossary', jsonb_build_object(
      'edited', coalesce((select glossary_edited from corrections), 0),
      'total', coalesce((select glossary_total from corrections), 0)
    ),
    'translations', jsonb_build_object(
      'corrected', coalesce((select corrected from translations), 0),
      'total', coalesce((select total from translations), 0)
    )
  )
  -- No row in `me` means the caller is not a HOD or principal, and the whole
  -- select collapses to nothing rather than leaking a school-wide roll-up.
  where exists (select 1 from me);
$$;

revoke all on function public.school_language_analytics() from public;
grant execute on function public.school_language_analytics() to authenticated;
