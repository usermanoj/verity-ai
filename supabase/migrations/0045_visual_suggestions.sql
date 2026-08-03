-- What the model thinks a bare section could be illustrated with.
--
-- 0040 gave a teacher the picker. It works, and using it well means reading 32
-- sections and remembering what eight interactives do. So the model reads, and
-- the teacher decides — which is only a real division of labour if the two
-- halves are kept apart in the data, not just in the interface.
--
-- Hence a separate table. A suggestion is NOT a visual:
--
--   section_visuals              what the lesson shows. Students read it.
--   section_visual_suggestions   what was proposed. No student can read it.
--
-- Writing a suggestion into section_visuals would have been less code and one
-- fewer table, and it would have made an AI guess indistinguishable from a
-- teacher's decision the moment it was stored — including to the teacher, who
-- would find choices in their lesson they never made. The separation IS the
-- approval step. Until someone accepts one, a suggestion has changed no lesson
-- and reached no child.
--
-- One row per section at most. A second opinion about the same section is a
-- replacement, not an addition.

create table if not exists public.section_visual_suggestions (
  chunk_id uuid primary key references public.corpus_chunks (id) on delete cascade,
  -- An id from the catalogue in ConceptVisual.tsx, checked in TypeScript
  -- before it is written (see lib/visuals/suggest.ts). Not an enum, for the
  -- same reason section_visuals.visual is not one: adding an interactive is a
  -- code change and should not also be a migration.
  visual text not null,
  -- One sentence, addressed to the teacher, naming what in the section this
  -- illustrates. NOT NULL because a suggestion that cannot say why is a guess
  -- wearing a recommendation's clothes, and the teacher is being asked to
  -- approve it on exactly this basis.
  reason text not null,
  -- Which model said so. When a suggestion turns out to be consistently poor,
  -- the useful question is which model produced it.
  model text,
  created_at timestamptz not null default now(),
  -- "No thanks." Kept rather than deleted so the same suggestion is not made
  -- again on the next pass — an assistant that re-offers what you already
  -- rejected is not assisting.
  dismissed_at timestamptz,
  dismissed_by uuid references public.users (id) on delete set null
);

alter table public.section_visual_suggestions enable row level security;

-- Staff only, and only for material they can already read.
--
-- The student half of that condition is the point: a suggestion is unreviewed
-- machine output, and the one promise this product makes is that nothing
-- reaches a child until a teacher has approved it. can_read_section_visual is
-- reused rather than restated so this cannot drift from the rule governing the
-- material itself — the mistake 0041 made and 0044 fixed.
drop policy if exists section_visual_suggestions_select on public.section_visual_suggestions;
create policy section_visual_suggestions_select on public.section_visual_suggestions
  for select
  using (public.i_am_staff() and public.can_read_section_visual(chunk_id));

-- No write policy. The suggestion pass writes with the service role after
-- checking ownership, the way ingestion writes chunks and questions; dismissal
-- goes through the function below.

-- Dismisses a suggestion the teacher does not want.
--
-- Deliberately NOT the same thing as hiding a visual. "No thanks" says the
-- proposal was wrong; section_visuals with a null says "show nothing in this
-- section". A teacher who rejects a suggestion has not decided the section
-- should stay bare forever, and collapsing the two would put words in their
-- mouth.
create or replace function public.teacher_dismiss_visual_suggestion(p_chunk_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not public.i_am_staff() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  -- Their own upload, the same ownership rule teacher_set_section_visual
  -- applies. Being senior does not make a colleague's lesson yours to edit.
  if not exists (
    select 1
    from public.corpus_chunks c
    join public.corpus_documents d on d.id = c.document_id
    where c.id = p_chunk_id and d.uploaded_by = v_actor
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update public.section_visual_suggestions
     set dismissed_at = now(), dismissed_by = v_actor
   where chunk_id = p_chunk_id and dismissed_at is null;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.teacher_dismiss_visual_suggestion(uuid) from public, anon;
grant execute on function public.teacher_dismiss_visual_suggestion(uuid) to authenticated;
