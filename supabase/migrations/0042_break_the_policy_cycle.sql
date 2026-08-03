-- Breaking the mutual recursion between the corpus policies.
--
-- Since 0004, two policies have each asked the other for permission:
--
--   corpus_document_sections_select  reads corpus_documents
--   corpus_documents_select          reads corpus_document_sections
--
-- Postgres applies a table's policies to any table a policy reads, so
-- evaluating either one enters a loop and the query fails outright with
-- "infinite recursion detected in policy for relation …". corpus_chunks and
-- generated_questions read those tables too, so they fail the same way.
--
-- This is not a future problem. Measured today, before this migration, every
-- one of the four tables errored for every account in the school —
-- principal, teacher and both students. The application never noticed because
-- it reads the corpus with the service role, which bypasses RLS completely:
-- the policies could have granted everything to everyone and every page would
-- have looked exactly the same. That is why it survived 38 migrations.
--
-- The fix is to stop policies reading RLS-protected tables at all. Each
-- question a policy needs answered becomes a security-definer function, which
-- runs as the owner, so no policies apply inside it and there is no cycle to
-- enter. auth.uid() still resolves to the caller — it reads the request's JWT,
-- not the executing role — so nothing extra is granted. current_app_user()
-- has worked this way since 0001; this applies the same technique to the four
-- questions that were being asked inline.
--
-- WHO CAN READ WHAT IS DELIBERATELY UNCHANGED. Every predicate below is the
-- same condition the policy stated before, moved rather than rewritten. A
-- policy rewrite that quietly widens access is the failure this migration is
-- most at risk of, and it is not the one to combine with a scope change:
-- scripts/check-corpus-access.mts exists to prove the counts match.
--
-- Cost: Postgres does not inline security-definer functions, so these run once
-- per row rather than folding into the query. At this school's scale (54
-- chunks, 224 questions) that is nothing, and the corpus is not read through
-- RLS on any hot path. If that changes, the answer is to index
-- corpus_document_sections (document_id, class_id) — already the primary key —
-- not to inline the loop back in.

-- ─────────────────────────────────────────────────────────── the predicates

-- A section of a course at my school.
create or replace function public.class_in_my_school(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id
      and c.school_id = (select school_id from public.current_app_user())
  );
$$;

-- A document I uploaded, whatever my role.
create or replace function public.document_is_mine(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.corpus_documents d
    where d.id = p_document_id and d.uploaded_by = auth.uid()
  );
$$;

-- A document applied to at least one section at my school. School-wide, not
-- enrolment-scoped: that is what these policies have always said, and the
-- narrowing to "classes this student is actually in" is done above this layer
-- by lib/access.ts. Widening or narrowing it is a separate decision from
-- making it evaluable.
create or replace function public.document_in_my_school(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.corpus_document_sections ds
    join public.classes c on c.id = ds.class_id
    where ds.document_id = p_document_id
      and c.school_id = (select school_id from public.current_app_user())
  );
$$;

-- A section of such a document.
create or replace function public.chunk_in_my_school(p_chunk_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.corpus_chunks cc
    join public.corpus_document_sections ds on ds.document_id = cc.document_id
    join public.classes c on c.id = ds.class_id
    where cc.id = p_chunk_id
      and c.school_id = (select school_id from public.current_app_user())
  );
$$;

revoke all on function public.class_in_my_school(uuid) from public, anon;
revoke all on function public.document_is_mine(uuid) from public, anon;
revoke all on function public.document_in_my_school(uuid) from public, anon;
revoke all on function public.chunk_in_my_school(uuid) from public, anon;

grant execute on function public.class_in_my_school(uuid) to authenticated;
grant execute on function public.document_is_mine(uuid) to authenticated;
grant execute on function public.document_in_my_school(uuid) to authenticated;
grant execute on function public.chunk_in_my_school(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────── the policies
--
-- Each now reads only its own row's columns and these functions. No policy
-- reads another RLS-protected table, so the graph has no edges left to form a
-- cycle with — the property holds by construction rather than by tracing it.

drop policy if exists corpus_document_sections_select on public.corpus_document_sections;
create policy corpus_document_sections_select on public.corpus_document_sections
  for select using (
    public.class_in_my_school(class_id)
    or public.document_is_mine(document_id)
  );

drop policy if exists corpus_documents_select on public.corpus_documents;
create policy corpus_documents_select on public.corpus_documents
  for select using (
    uploaded_by = auth.uid()
    or public.document_in_my_school(id)
  );

drop policy if exists corpus_chunks_select on public.corpus_chunks;
create policy corpus_chunks_select on public.corpus_chunks
  for select using (
    public.document_is_mine(document_id)
    or public.document_in_my_school(document_id)
  );

drop policy if exists generated_questions_select on public.generated_questions;
create policy generated_questions_select on public.generated_questions
  for select using (
    generated_by = auth.uid()
    or (status = 'approved' and public.chunk_in_my_school(chunk_id))
  );
