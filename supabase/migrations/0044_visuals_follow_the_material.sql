-- Making a section's illustration readable by whoever can read the section.
--
-- 0041 wrote the section_visuals rule by hand: the uploader, or a student the
-- document reaches. That was right for the two readers it was thinking about
-- and wrong for a third — a head of department who opens a colleague's lesson
-- sees the material and none of the illustration choices on it. Nothing breaks;
-- the lesson simply looks unillustrated to the one person whose job is to
-- review how it is taught.
--
-- The deeper problem is that it was written by hand at all. "Who may read this
-- chunk" is already decided, by corpus_chunks_select, and 0043 changed that
-- answer — twice narrowing it for students and keeping it school-wide for
-- staff — without section_visuals hearing about it. Two copies of one rule
-- drift, and the copy nobody reads drifts silently.
--
-- So this stops stating the rule and starts referring to it. A visual is
-- readable exactly when its section is readable, expressed with the same three
-- predicates corpus_chunks_select uses. Change who may read the corpus and the
-- illustrations follow, because there is no second place to remember.
--
-- The one deliberate consequence: staff can now read the visual overrides on
-- any document in their school, as they can already read its chunks. Approval
-- is still required for students, inside document_reaches_me, exactly as it is
-- for the material itself.

create or replace function public.can_read_section_visual(p_chunk_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.corpus_chunks cc
    where cc.id = p_chunk_id
      and (
        -- The same three branches as corpus_chunks_select, in the same order.
        -- If that policy gains or loses one, this is the line that has to
        -- change with it — and it is one line, in one file.
        public.document_is_mine(cc.document_id)
        or (public.i_am_staff() and public.document_in_my_school(cc.document_id))
        or public.document_reaches_me(cc.document_id)
      )
  );
$$;

-- The policy itself is unchanged from 0041 — it already asked this function the
-- question. Recreated only so the file stands alone if it is ever replayed
-- against a database that does not have 0041.
drop policy if exists section_visuals_select on public.section_visuals;
create policy section_visuals_select on public.section_visuals
  for select
  using (public.can_read_section_visual(chunk_id));
