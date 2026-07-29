-- Two fixes found by auditing a real student's data.

-- 1. Conversation history pointed at documents that no longer exist.
--
-- conversations.topic_id is text with no foreign key, and deliberately so: it
-- holds a document uuid for uploaded material and a slug ("moments") for the
-- two seeded demo topics, and no single FK covers both. But it meant that
-- re-uploading a deck — which supersedes or replaces the old row — left every
-- conversation about it referencing nothing. A teacher reading the transcript
-- could not tell which lesson it was.
--
-- Two columns, because two different things were lost:
--
--   topic_title  a snapshot of the lesson's name, so the record stays
--                READABLE even after the document is gone. History is a
--                record of what a child did; it must not decay because the
--                teacher tidied up their uploads.
--
--   document_id  a real FK for the uuid case, so the link is either valid or
--                explicitly null — never a string pointing at a ghost.
--
-- ON DELETE SET NULL, not CASCADE. Deleting a document must never delete the
-- record of a student's work.
alter table public.conversations
  add column if not exists topic_title text,
  add column if not exists document_id uuid references public.corpus_documents (id) on delete set null;

-- Backfill: where the topic_id is still a live document, adopt its name and
-- link it. Conversations whose document is already gone keep a null title —
-- honest, and better than inventing one.
update public.conversations c
set
  document_id = d.id,
  topic_title = regexp_replace(d.source_file, '\.[^.]+$', '')
from public.corpus_documents d
where c.document_id is null
  and c.topic_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and d.id = c.topic_id::uuid;

-- The two demo topics have stable, known names and no row to join to.
update public.conversations
set topic_title = case topic_id
    when 'moments' then 'Moments of a Force'
    when 'distance-time' then 'Distance–Time Graphs'
  end
where topic_title is null and topic_id in ('moments', 'distance-time');

create index if not exists conversations_document_idx
  on public.conversations (document_id);

-- 2. A section with students and no material is invisible to the teacher.
--
-- The audit found 7D with one enrolled student and nothing to read, and the
-- seeded 8C with twenty-three. The student's experience is an empty page they
-- cannot diagnose; the teacher's is a class code that looks like it worked.
-- Nothing anywhere said the two halves had not met.
--
-- Surfaced on the class-code list, which is exactly where a teacher is
-- standing when they hand a code out.
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
      -- Approved specifically: a pending document is not something a student
      -- can read, so a section whose only material is awaiting review is
      -- still a section whose students see nothing.
      'hasMaterial', exists (
        select 1
        from public.corpus_document_sections ds
        join public.corpus_documents d on d.id = ds.document_id
        where ds.class_id = cl.id
          and d.status = 'approved'
          and d.superseded_at is null
      )
    ) as x
    from public.classes cl
    join public.courses co on co.id = cl.course_id
    join me on me.id = cl.teacher_id
  ) rows;
$$;

revoke all on function public.teacher_class_codes() from public, anon;
grant execute on function public.teacher_class_codes() to authenticated;
