-- Narrowing the corpus policies from "my school" to "my classes".
--
-- 0042 made these policies evaluable without changing who they let in. This
-- changes who they let in, which is the point: they say a signed-in student may
-- read any approved deck belonging to any class in the school, including
-- material for years they are not in and subjects they do not take. The real
-- rule — the classes this student is actually enrolled in — has been enforced
-- only in TypeScript, by lib/access.ts, on the way to the page.
--
-- One rule in one place is not the same as one rule. The database has been
-- willing to hand over the whole school's corpus to any student who asked it
-- directly, and nothing but application code stood in the way.
--
-- Two deliberate narrowings, both for students only:
--
--   1. ENROLMENT. A student reads a document only through a class they are in.
--      Staff keep the school-wide view: a teacher legitimately browses a
--      colleague's material, which is what /subjects already shows them, and
--      lib/access.ts returns "all" for teacher, hod and principal. Narrowing
--      staff would be a different decision with different consequences.
--
--   2. APPROVAL. A student reads only approved documents. Sections are mapped
--      to classes before the teacher approves the deck, so an enrolled student
--      could read a draft — chunks and all — while their teacher was still
--      reviewing it. The whole promise of the product is that the AI and the
--      lesson draw on teacher-approved material; a draft leaking through the
--      table underneath makes that promise untrue in the one place it cannot
--      be checked from the outside.
--
--      Every document in the school is approved today, so this changes no
--      count in the verification below. That is deliberate: it closes the hole
--      while being provably invisible in the diff, so the enrolment change can
--      be read on its own.
--
-- Nothing in the application reads the corpus through RLS — every path goes
-- through the service role — so this cannot break a page. It is the layer
-- underneath finally agreeing with the layer above.

-- ────────────────────────────────────────────────────── the new predicates

-- Staff at all, in the sense lib/access.ts means it.
create or replace function public.i_am_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.current_app_user()) in ('teacher', 'hod', 'principal'), false);
$$;

-- A section I am enrolled in.
create or replace function public.i_am_in_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_enrollments e
    where e.class_id = p_class_id and e.student_id = auth.uid()
  );
$$;

-- An approved document applied to a section I am enrolled in.
create or replace function public.document_reaches_me(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.corpus_documents d
    join public.corpus_document_sections ds on ds.document_id = d.id
    join public.class_enrollments e on e.class_id = ds.class_id
    where d.id = p_document_id
      and d.status = 'approved'
      and e.student_id = auth.uid()
  );
$$;

-- A section of such a document.
create or replace function public.chunk_reaches_me(p_chunk_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.corpus_chunks cc
    where cc.id = p_chunk_id and public.document_reaches_me(cc.document_id)
  );
$$;

revoke all on function public.i_am_staff() from public, anon;
revoke all on function public.i_am_in_class(uuid) from public, anon;
revoke all on function public.document_reaches_me(uuid) from public, anon;
revoke all on function public.chunk_reaches_me(uuid) from public, anon;

grant execute on function public.i_am_staff() to authenticated;
grant execute on function public.i_am_in_class(uuid) to authenticated;
grant execute on function public.document_reaches_me(uuid) to authenticated;
grant execute on function public.chunk_reaches_me(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────── the policies
--
-- Each keeps 0042's shape — own-row columns plus security-definer predicates,
-- so no policy reads an RLS-protected table and the cycle cannot come back.
-- The school-wide branch survives, gated on being staff; the student's route
-- in is now enrolment.

drop policy if exists corpus_document_sections_select on public.corpus_document_sections;
create policy corpus_document_sections_select on public.corpus_document_sections
  for select using (
    public.document_is_mine(document_id)
    or (public.i_am_staff() and public.class_in_my_school(class_id))
    or public.i_am_in_class(class_id)
  );

drop policy if exists corpus_documents_select on public.corpus_documents;
create policy corpus_documents_select on public.corpus_documents
  for select using (
    uploaded_by = auth.uid()
    or (public.i_am_staff() and public.document_in_my_school(id))
    or public.document_reaches_me(id)
  );

drop policy if exists corpus_chunks_select on public.corpus_chunks;
create policy corpus_chunks_select on public.corpus_chunks
  for select using (
    public.document_is_mine(document_id)
    or (public.i_am_staff() and public.document_in_my_school(document_id))
    or public.document_reaches_me(document_id)
  );

drop policy if exists generated_questions_select on public.generated_questions;
create policy generated_questions_select on public.generated_questions
  for select using (
    generated_by = auth.uid()
    or (
      status = 'approved'
      and (
        (public.i_am_staff() and public.chunk_in_my_school(chunk_id))
        or public.chunk_reaches_me(chunk_id)
      )
    )
  );
