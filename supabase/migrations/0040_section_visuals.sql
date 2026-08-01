-- Letting a teacher decide which interactive a section gets.
--
-- Matching is done by regex over the heading and the text (see
-- ConceptVisual.tsx), and it is deliberately conservative: a section that does
-- not clearly match gets nothing, because a wrong diagram teaches a wrong
-- thing. That conservatism is right and it has a cost — on the three real decks
-- in this school it leaves 39 of 54 sections with no interactive, and some of
-- those a teacher would happily have illustrated.
--
-- This is the override. It does not replace matching; it corrects it. Three
-- things a teacher can now say that the regex cannot infer:
--
--   "put the lever here instead"   — the automatic choice landed on the formula
--                                    section, but I introduce it in section 3
--   "show nothing here"            — the match is wrong for my class
--   "add one here"                 — this section is about balancing and the
--                                    wording never says so
--
-- One row per chunk at most. A section shows one interactive or none: two would
-- be a section arguing with itself.

create table if not exists public.section_visuals (
  chunk_id uuid primary key references public.corpus_chunks (id) on delete cascade,
  -- The visual's id, or null meaning "show nothing here". Null is a REAL
  -- choice, distinct from having no row at all — no row means "use whatever
  -- matching decides", and null means "I looked at this and I want none".
  -- Collapsing the two would make "hide it" impossible to express.
  visual text,
  set_by uuid references public.users (id) on delete set null,
  set_at timestamptz not null default now()
);

-- Free text rather than an enum, checked in TypeScript against the registry.
-- Adding a visual is a code change; it should not also be a migration, and an
-- id that no longer exists renders as nothing rather than breaking a lesson.

alter table public.section_visuals enable row level security;

-- Students read this: it decides what their lesson shows. Scoped to material
-- that actually reaches them, the same rule the corpus itself uses — a chunk
-- they cannot read is a chunk whose visual is none of their business.
drop policy if exists section_visuals_select on public.section_visuals;
create policy section_visuals_select on public.section_visuals
  for select
  using (
    exists (
      select 1
      from public.corpus_chunks c
      join public.corpus_documents d on d.id = c.document_id
      where c.id = section_visuals.chunk_id
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
    )
  );

-- No write policy. Writes go through the function below, which checks the
-- caller owns the document — a policy would have to repeat that join and the
-- two would drift.

-- Sets or clears a section's visual.
--
-- p_visual null with p_explicit true means "show nothing here". Passing
-- p_explicit false removes the row entirely and hands the section back to
-- automatic matching, which is a third state and needs saying out loud rather
-- than being inferred from a null.
create or replace function public.teacher_set_section_visual(
  p_chunk_id uuid,
  p_visual text,
  p_explicit boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not exists (
    select 1 from public.users
    where id = v_actor and role in ('teacher', 'hod', 'principal')
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  -- Their own upload. Being senior does not make a colleague's lesson yours to
  -- redecorate, the same rule teacher_set_document_sections applies.
  if not exists (
    select 1
    from public.corpus_chunks c
    join public.corpus_documents d on d.id = c.document_id
    where c.id = p_chunk_id and d.uploaded_by = v_actor
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not p_explicit then
    delete from public.section_visuals where chunk_id = p_chunk_id;
    return jsonb_build_object('ok', true, 'state', 'automatic');
  end if;

  insert into public.section_visuals (chunk_id, visual, set_by, set_at)
  values (p_chunk_id, p_visual, v_actor, now())
  on conflict (chunk_id) do update
    set visual = excluded.visual, set_by = excluded.set_by, set_at = now();

  return jsonb_build_object('ok', true, 'state', case when p_visual is null then 'hidden' else 'chosen' end);
end;
$$;

revoke all on function public.teacher_set_section_visual(uuid, text, boolean) from public, anon;
grant execute on function public.teacher_set_section_visual(uuid, text, boolean) to authenticated;
