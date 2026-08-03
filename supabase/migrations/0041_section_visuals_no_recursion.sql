-- Fixes the select policy 0040 shipped: it could not be evaluated at all.
--
-- Reading section_visuals as a real signed-in person failed with
--
--   infinite recursion detected in policy for relation "corpus_document_sections"
--
-- and the cycle is not in 0040. It has been in the schema since 0004:
--
--   corpus_document_sections_select  reads corpus_documents
--   corpus_documents_select          reads corpus_document_sections
--
-- Each policy asks the other for permission, forever. Nothing hit it until now
-- because every read of the corpus goes through the service role, which
-- bypasses RLS entirely — so the cycle sat there for 36 migrations looking like
-- working code. 0040 was the first policy to make an authenticated user
-- actually traverse those tables, and it inherited the loop.
--
-- The fix is to stop traversing them under RLS. Reachability is one question
-- with one answer, so it becomes one function that computes it as the owner:
-- no policies apply inside, so there is no cycle to enter. auth.uid() still
-- resolves to the caller — it reads the request's JWT, not the executing role —
-- so this grants nothing extra. It answers exactly the question the inline
-- predicate asked, and can be tested on its own.
--
-- The underlying 0004 cycle is left alone deliberately: it is a separate defect
-- with a wider blast radius (four policies), and fixing it here would mean
-- changing who can read the corpus in a migration whose subject is pictures.

create or replace function public.can_read_section_visual(p_chunk_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.corpus_chunks c
    join public.corpus_documents d on d.id = c.document_id
    where c.id = p_chunk_id
      and d.status = 'approved'
      and (
        -- The uploader, whatever their role.
        d.uploaded_by = auth.uid()
        -- Or a student in a section the document reaches.
        or exists (
          select 1
          from public.corpus_document_sections ds
          join public.class_enrollments e on e.class_id = ds.class_id
          where ds.document_id = d.id and e.student_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.can_read_section_visual(uuid) from public, anon;
grant execute on function public.can_read_section_visual(uuid) to authenticated;

drop policy if exists section_visuals_select on public.section_visuals;
create policy section_visuals_select on public.section_visuals
  for select
  using (public.can_read_section_visual(chunk_id));
