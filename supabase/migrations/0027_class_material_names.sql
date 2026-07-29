-- Name the material that reaches each section.
--
-- The class list could say "no material — students see nothing", which is the
-- alarming case, but said nothing at all about the ordinary one. Looking at
-- "Grade 7 Physics · 7C" a teacher had no way to know that is where the
-- Magnets deck went — they had to hold the mapping in their head, or go to
-- another screen and read it off the uploads list.
--
-- A warning that only appears when something is wrong teaches nobody where
-- things are. Listing what each section HAS makes the absence meaningful.

create or replace function public.teacher_class_codes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id from public.users where id = auth.uid() and role = 'teacher'
  )
  select coalesce(jsonb_agg(x order by x->>'subject', x->>'grade', x->>'section'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'classId', cl.id,
      'section', cl.section_name,
      'subject', co.subject,
      'grade', co.grade,
      'academicYear', co.academic_year,
      'code', (
        select j.code from public.class_join_codes j
        where j.class_id = cl.id and j.revoked_at is null
        order by j.created_at desc limit 1
      ),
      'students', (
        select count(*) from public.class_enrollments e where e.class_id = cl.id
      ),
      -- Approved and current only. A section whose one document is awaiting
      -- review, or has been superseded, is still a section whose students
      -- open the app to an empty page.
      --
      -- Titles rather than a count: "2 documents" tells a teacher they have
      -- not made a mistake; "Magnets and Electromagnets" tells them which
      -- mistake they have not made.
      'materials', coalesce((
        select jsonb_agg(regexp_replace(d.source_file, '\.[^.]+$', '') order by d.created_at desc)
        from public.corpus_document_sections ds
        join public.corpus_documents d on d.id = ds.document_id
        where ds.class_id = cl.id
          and d.status = 'approved'
          and d.superseded_at is null
      ), '[]'::jsonb)
    ) as x
    from public.classes cl
    join public.courses co on co.id = cl.course_id
    join me on me.id = cl.teacher_id
  ) rows;
$$;

revoke all on function public.teacher_class_codes() from public, anon;
grant execute on function public.teacher_class_codes() to authenticated;
