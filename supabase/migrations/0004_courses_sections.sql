-- Verity AI — courses/sections model + corpus sharing + dashboard scoping
-- (Phase 2 hardening, before the first live-test with real teachers)
--
-- Apply AFTER 0001–0003. Unlike those, this migration ALTERs tables that
-- 0001 already created live, so it is written to run against the existing
-- (currently empty) schema: no classes/corpus rows exist yet because no
-- teacher has signed in or uploaded, which is exactly why now is the cheap
-- moment to restructure — there is no data to migrate.
--
-- Fully idempotent / re-runnable (every statement guarded), because the
-- Supabase SQL editor autocommits statement-by-statement: a failure partway
-- leaves earlier statements applied, so re-running the whole file must be
-- safe.
--
-- Why: the original `classes` table conflated "a course" (Grade 7 Physics)
-- with "a section" (7A). A real school has multiple sections of the same
-- course (7A–7F), multiple teachers across them (3 Physics teachers over 6
-- sections), and one teacher may own several sections (7A + 7B). The old
-- getOrCreateTeacherClass() assumed exactly one class per teacher and would
-- have silently merged a teacher's Physics-7A and Physics-7B corpora, and a
-- second subject into the first. This splits course from section and lets a
-- single upload apply to one or more of the uploader's own sections.

-- 1. courses — the curriculum unit, one row per (subject, grade, year) -----
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  subject text not null,
  grade text not null,
  academic_year text not null,
  created_at timestamptz not null default now(),
  unique (school_id, subject, grade, academic_year)
);

-- 2. classes becomes a *section* of a course --------------------------------
-- subject/grade move up to courses (single source of truth); a section is
-- identified by (course_id, section_name) and owned by one teacher. NOT NULL
-- is safe only because the table is empty (see header).
alter table public.classes
  add column if not exists course_id uuid references public.courses (id) on delete cascade,
  add column if not exists section_name text;

alter table public.classes drop column if exists subject;
alter table public.classes drop column if exists grade;

alter table public.classes alter column course_id set not null;
alter table public.classes alter column section_name set not null;

create unique index if not exists classes_course_section_uniq
  on public.classes (course_id, section_name);

-- 3. Drop the policies that reach the school through
--    corpus_documents.class_id BEFORE dropping that column — Postgres
--    refuses to drop a column any policy still depends on. They are
--    recreated in step 6 against the new join table.
drop policy if exists corpus_documents_select on public.corpus_documents;
drop policy if exists corpus_chunks_select on public.corpus_chunks;
drop policy if exists generated_questions_select on public.generated_questions;

-- 4. corpus documents apply to many sections via a join ---------------------
-- A document is no longer tied to a single class. It is owned by its
-- uploader (uploaded_by) and applies to a set of that teacher's sections,
-- recorded here. Retrieval and visibility go through this table.
alter table public.corpus_documents drop column if exists class_id;

create table if not exists public.corpus_document_sections (
  document_id uuid not null references public.corpus_documents (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  primary key (document_id, class_id)
);

-- 5. RLS enable -------------------------------------------------------------
alter table public.courses enable row level security;
alter table public.corpus_document_sections enable row level security;

-- 6. (Re)create policies — each guarded with drop-if-exists so the file is
--    re-runnable. Courses/sections are provisioned server-side with the
--    service-role key (bypasses RLS), so only SELECT policies are needed.
drop policy if exists courses_select on public.courses;
create policy courses_select on public.courses
  for select using (school_id = (select school_id from public.current_app_user()));

drop policy if exists corpus_document_sections_select on public.corpus_document_sections;
create policy corpus_document_sections_select on public.corpus_document_sections
  for select using (
    class_id in (
      select id from public.classes
      where school_id = (select school_id from public.current_app_user())
    )
    or document_id in (select id from public.corpus_documents where uploaded_by = auth.uid())
  );

create policy corpus_documents_select on public.corpus_documents
  for select using (
    uploaded_by = auth.uid()
    or id in (
      select ds.document_id from public.corpus_document_sections ds
      join public.classes c on c.id = ds.class_id
      where c.school_id = (select school_id from public.current_app_user())
    )
  );

create policy corpus_chunks_select on public.corpus_chunks
  for select using (
    document_id in (select id from public.corpus_documents where uploaded_by = auth.uid())
    or document_id in (
      select ds.document_id from public.corpus_document_sections ds
      join public.classes c on c.id = ds.class_id
      where c.school_id = (select school_id from public.current_app_user())
    )
  );

create policy generated_questions_select on public.generated_questions
  for select using (
    generated_by = auth.uid()
    or (
      status = 'approved'
      and chunk_id in (
        select cc.id from public.corpus_chunks cc
        join public.corpus_document_sections ds on ds.document_id = cc.document_id
        join public.classes c on c.id = ds.class_id
        where c.school_id = (select school_id from public.current_app_user())
      )
    )
  );

-- 7. Scope dashboards to a teacher's own students ---------------------------
-- The 0001 policies let ANY teacher read EVERY student's attempts/events
-- school-wide. Restrict a teacher to students enrolled in a section they
-- teach (via class_enrollments); HOD/principal keep the school-wide view.
drop policy if exists practice_attempts_select on public.practice_attempts;
create policy practice_attempts_select on public.practice_attempts
  for select using (
    student_id = auth.uid()
    or (select role from public.current_app_user()) in ('hod', 'principal')
    or student_id in (
      select ce.student_id from public.class_enrollments ce
      join public.classes c on c.id = ce.class_id
      where c.teacher_id = auth.uid()
    )
  );

drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select using (
    user_id = auth.uid()
    or (select role from public.current_app_user()) in ('hod', 'principal')
    or user_id in (
      select ce.student_id from public.class_enrollments ce
      join public.classes c on c.id = ce.class_id
      where c.teacher_id = auth.uid()
    )
  );
