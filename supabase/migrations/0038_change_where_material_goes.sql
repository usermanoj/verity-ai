-- Letting a teacher change which classes a deck reaches.
--
-- corpus_document_sections is written once, during upload, and never again.
-- There has never been a way to correct it. A teacher who picks the wrong
-- section — or whose classes change between terms, which is every term — can
-- only re-upload the file, wait for extraction, and approve every generated
-- question a second time.
--
-- The cost is visible in the real data. 7A had the distance-time deck, the
-- teacher re-uploaded it and chose 7B, and 7A silently emptied. Meanwhile 7D
-- has a pupil enrolled and no material at all, and the dashboard has been
-- saying so for days with no button to press about it.
--
-- Both are the same missing verb.
--
-- Takes class ids rather than section names. The upload path takes names and
-- CREATES a class when one does not exist, which is right at upload — a teacher
-- typing "7A" means to teach 7A — and wrong here: this is a correction, and a
-- typo should move nothing rather than invent a class to move it to.

create or replace function public.teacher_set_document_sections(
  p_document_id uuid,
  p_class_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owned int;
  v_requested int := coalesce(array_length(p_class_ids, 1), 0);
begin
  if not exists (
    select 1 from public.users
    where id = v_actor and role in ('teacher', 'hod', 'principal')
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  -- Their own upload, and nobody else's. A document is owned by whoever
  -- uploaded it; being senior does not make another teacher's material yours
  -- to move.
  if not exists (
    select 1 from public.corpus_documents
    where id = p_document_id and uploaded_by = v_actor
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Every requested class must be one the caller teaches. Counted rather than
  -- filtered: silently dropping a class the caller may not touch would report
  -- success for something that did not happen.
  select count(*) into v_owned
  from public.classes
  where id = any(p_class_ids) and teacher_id = v_actor;

  if v_owned <> v_requested then
    return jsonb_build_object('ok', false, 'error', 'not_your_class');
  end if;

  -- Replace, not merge. The caller sends the complete set they want, so
  -- removing a section is expressible — which is the whole point, since the
  -- alternative is a list that can only ever grow.
  delete from public.corpus_document_sections
  where document_id = p_document_id
    and class_id not in (select unnest(p_class_ids));

  insert into public.corpus_document_sections (document_id, class_id)
  select p_document_id, unnest(p_class_ids)
  on conflict do nothing;

  return jsonb_build_object('ok', true, 'sections', v_requested);
end;
$$;

revoke all on function public.teacher_set_document_sections(uuid, uuid[]) from public, anon;
grant execute on function public.teacher_set_document_sections(uuid, uuid[]) to authenticated;

-- The material list gains the class ids behind the section names, so the
-- interface can show which boxes are already ticked. Names alone cannot be
-- matched back to a class reliably — two courses can both have a "7A".
--
-- Re-declared in full because it is being changed. The role predicate is
-- spelled `in ('teacher','hod','principal')`, preserving what 0035 widened:
-- copying the body from 0022 verbatim would have quietly reverted it.
create or replace function public.teacher_material_list(p_limit int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with docs as (
    select d.id, d.source_file, d.status, d.version, d.created_at
    from public.corpus_documents d
    where d.uploaded_by = auth.uid()
      and d.superseded_at is null
    order by d.created_at desc
    limit p_limit
  ),
  placement as (
    select
      ds.document_id,
      min(co.subject) as subject,
      min(co.grade) as grade,
      array_agg(distinct c.section_name order by c.section_name) as sections,
      array_agg(distinct c.id) as class_ids
    from public.corpus_document_sections ds
    join public.classes c on c.id = ds.class_id
    join public.courses co on co.id = c.course_id
    where ds.document_id in (select id from docs)
    group by ds.document_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'source_file', d.source_file,
        'status', d.status,
        'version', d.version,
        'created_at', d.created_at,
        'subject', coalesce(p.subject, 'Unassigned'),
        'grade', coalesce(p.grade, ''),
        'sections', coalesce(to_jsonb(p.sections), '[]'::jsonb),
        'classIds', coalesce(to_jsonb(p.class_ids), '[]'::jsonb)
      ) order by d.created_at desc
    ),
    '[]'::jsonb
  )
  from docs d
  left join placement p on p.document_id = d.id
  where exists (
    select 1 from public.users
    where id = auth.uid() and role in ('teacher', 'hod', 'principal')
  );
$$;

revoke all on function public.teacher_material_list(int) from public, anon;
grant execute on function public.teacher_material_list(int) to authenticated;
