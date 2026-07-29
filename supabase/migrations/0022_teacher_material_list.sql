-- The teacher dashboard's "Your material" list.
--
-- The first version of this panel read corpus_documents directly through the
-- caller's session and came back empty, while /teacher/ingest — which goes
-- through the SECURITY DEFINER teacher_ingest_state RPC — listed the same
-- teacher's five approved documents on the same deploy. The policy looks like
-- it should allow it (uploaded_by = auth.uid()), so the difference is
-- somewhere in evaluating the policy across the three embedded tables the
-- subject/grade join needs: corpus_document_sections → classes → courses.
--
-- Rather than keep guessing at a policy interaction, the read gets the same
-- treatment as every other teacher-scoped read in this app: one SECURITY
-- DEFINER function whose WHERE clause states the rule plainly, in one place,
-- where it can be read and audited. It is scoped to the caller's own uploads
-- and nothing else.

create or replace function public.teacher_material_list(p_limit int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with docs as (
    select
      d.id,
      d.source_file,
      d.status,
      d.version,
      d.created_at
    from public.corpus_documents d
    where d.uploaded_by = auth.uid()
      -- Superseded versions are history: the teacher uploaded a replacement
      -- and it is the replacement they are looking for.
      and d.superseded_at is null
    order by d.created_at desc
    limit p_limit
  ),
  -- A document can apply to several of the teacher's own sections in one
  -- upload (7A and 7B), so the sections are aggregated rather than joined,
  -- which would otherwise multiply the document rows.
  placement as (
    select
      ds.document_id,
      min(co.subject) as subject,
      min(co.grade) as grade,
      array_agg(distinct c.section_name order by c.section_name) as sections
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
        'subject', coalesce(p.subject, ''),
        'grade', coalesce(p.grade, ''),
        'sections', coalesce(to_jsonb(p.sections), '[]'::jsonb)
      )
      order by d.created_at desc
    ),
    '[]'::jsonb
  )
  from docs d
  left join placement p on p.document_id = d.id;
$$;

revoke all on function public.teacher_material_list(int) from public;
grant execute on function public.teacher_material_list(int) to authenticated;
