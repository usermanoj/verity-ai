-- Verity AI — document versions and duplicate-name resolution
--
-- Apply AFTER 0001–0007.
--
-- Why: uploading a file whose name already existed silently created a second
-- document. Students then saw the same topic twice with no way to tell which
-- was current, and a teacher fixing a typo in a deck had no way to say "this
-- replaces the old one". Re-uploading is the normal way to correct material,
-- so this was the common path, not an edge case.
--
-- The teacher now decides, and the decision is explicit:
--   'replace' — the old document is discarded outright (its chunks, questions
--               and section links cascade away). For "I uploaded the wrong
--               file" and for re-extracting a deck after an ingestion fix.
--   'version' — the old document is kept as history and superseded. The new
--               one becomes current. For "this is this year's update".
--
-- Both make exactly one document current for a given name, which is what
-- students read.

alter table public.corpus_documents
  add column if not exists version int not null default 1,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by uuid references public.corpus_documents (id) on delete set null;

-- Students and topic listings only ever want current documents, and that
-- filter runs on every corpus read.
create index if not exists corpus_documents_current_idx
  on public.corpus_documents (status, superseded_at)
  where superseded_at is null;

create index if not exists corpus_documents_name_idx
  on public.corpus_documents (uploaded_by, source_file)
  where superseded_at is null;

-- Replaces the 0007 definition. Signature changes (new p_resolutions
-- parameter), so the old one is dropped rather than left callable with stale
-- behaviour that would silently skip the duplicate check.
drop function if exists public.teacher_upload_init(text, text, text, text[], text[]);

create or replace function public.teacher_upload_init(
  p_subject text,
  p_grade text,
  p_academic_year text,
  p_sections text[],
  p_files text[],
  p_resolutions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user public.users;
  v_course_id uuid;
  v_section text;
  v_class_id uuid;
  v_class_ids uuid[] := '{}';
  v_owner uuid;
  v_file text;
  v_doc_id uuid;
  v_docs jsonb := '[]'::jsonb;
  v_existing public.corpus_documents;
  v_conflicts jsonb := '[]'::jsonb;
  v_choice text;
  v_seen text[] := '{}';
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null then
    return jsonb_build_object('error', 'Not signed in.');
  end if;
  if v_user.role <> 'teacher' then
    return jsonb_build_object('error', 'Only signed-in teachers can upload.');
  end if;

  -- Two files with the same name in ONE batch cannot be resolved: a single
  -- choice cannot describe both, and whichever landed second would silently
  -- supersede the first.
  foreach v_file in array p_files loop
    if v_file = any(v_seen) then
      return jsonb_build_object(
        'error',
        format('"%s" was selected twice in the same upload. Upload it once.', v_file)
      );
    end if;
    v_seen := v_seen || v_file;
  end loop;

  -- Course: one row per (school, subject, grade, year).
  select id into v_course_id
  from public.courses
  where school_id = v_user.school_id
    and subject = p_subject
    and grade = p_grade
    and academic_year = p_academic_year;

  if v_course_id is null then
    insert into public.courses (school_id, subject, grade, academic_year)
    values (v_user.school_id, p_subject, p_grade, p_academic_year)
    on conflict (school_id, subject, grade, academic_year) do nothing
    returning id into v_course_id;

    if v_course_id is null then
      select id into v_course_id
      from public.courses
      where school_id = v_user.school_id
        and subject = p_subject
        and grade = p_grade
        and academic_year = p_academic_year;
    end if;
  end if;

  -- Sections: reuse the teacher's own, create missing ones, and refuse a
  -- section another teacher already owns (teacher-scoped sharing only).
  foreach v_section in array p_sections loop
    select id, teacher_id into v_class_id, v_owner
    from public.classes
    where course_id = v_course_id and section_name = v_section;

    if v_class_id is null then
      insert into public.classes (school_id, course_id, section_name, teacher_id)
      values (v_user.school_id, v_course_id, v_section, v_user.id)
      returning id into v_class_id;
    elsif v_owner is not null and v_owner <> v_user.id then
      return jsonb_build_object(
        'error',
        format('Section "%s" of %s %s (%s) is managed by another teacher.',
               v_section, p_grade, p_subject, p_academic_year)
      );
    end if;

    v_class_ids := v_class_ids || v_class_id;
  end loop;

  -- PASS 1 — detect conflicts. Nothing is written for ANY file until every
  -- name is resolved: a partial upload would leave the teacher looking at a
  -- half-applied batch with no way to reason about what happened. plpgsql
  -- shares the caller's transaction, so an early return does NOT undo
  -- inserts; the two passes are what keep this all-or-nothing.
  foreach v_file in array p_files loop
    select d.* into v_existing
    from public.corpus_documents d
    where d.uploaded_by = v_user.id
      and d.source_file = v_file
      and d.superseded_at is null
      and exists (
        select 1 from public.corpus_document_sections s
        where s.document_id = d.id and s.class_id = any(v_class_ids)
      )
    order by d.version desc
    limit 1;

    if v_existing.id is not null then
      v_choice := p_resolutions ->> v_file;
      if v_choice is null or v_choice not in ('replace', 'version') then
        v_conflicts := v_conflicts || jsonb_build_object(
          'name', v_file,
          'existingId', v_existing.id,
          'version', v_existing.version,
          'status', v_existing.status,
          'uploadedAt', v_existing.created_at
        );
      end if;
    end if;
  end loop;

  if jsonb_array_length(v_conflicts) > 0 then
    return jsonb_build_object('conflicts', v_conflicts);
  end if;

  -- PASS 2 — write. Order matches p_files exactly: the caller zips signed
  -- URLs by index, and duplicate filenames rule out matching by name.
  foreach v_file in array p_files loop
    select d.* into v_existing
    from public.corpus_documents d
    where d.uploaded_by = v_user.id
      and d.source_file = v_file
      and d.superseded_at is null
      and exists (
        select 1 from public.corpus_document_sections s
        where s.document_id = d.id and s.class_id = any(v_class_ids)
      )
    order by d.version desc
    limit 1;

    v_choice := coalesce(p_resolutions ->> v_file, 'new');

    if v_existing.id is not null and v_choice = 'replace' then
      -- Chunks, generated questions and section links cascade from this.
      delete from public.corpus_documents where id = v_existing.id;

      insert into public.corpus_documents (uploaded_by, source_file, status, version)
      values (v_user.id, v_file, 'pending', v_existing.version)
      returning id into v_doc_id;

    elsif v_existing.id is not null and v_choice = 'version' then
      insert into public.corpus_documents (uploaded_by, source_file, status, version)
      values (v_user.id, v_file, 'pending', v_existing.version + 1)
      returning id into v_doc_id;

      update public.corpus_documents
      set superseded_at = now(), superseded_by = v_doc_id
      where id = v_existing.id;

    else
      insert into public.corpus_documents (uploaded_by, source_file, status, version)
      values (v_user.id, v_file, 'pending', 1)
      returning id into v_doc_id;
    end if;

    insert into public.corpus_document_sections (document_id, class_id)
    select v_doc_id, unnest(v_class_ids);

    v_docs := v_docs || jsonb_build_object('id', v_doc_id, 'name', v_file);
  end loop;

  return jsonb_build_object('documents', v_docs);
end;
$$;

revoke all on function public.teacher_upload_init(text, text, text, text[], text[], jsonb) from public, anon;
grant execute on function public.teacher_upload_init(text, text, text, text[], text[], jsonb) to authenticated;

-- Teacher list: carry the version through, and hide superseded documents so
-- the screen shows what is actually live for students.
create or replace function public.teacher_ingest_state(p_limit int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id, role, school_id, display_name
    from public.users
    where id = auth.uid()
  ),
  docs as (
    select d.id, d.source_file, d.status, d.created_at, d.version
    from public.corpus_documents d
    where d.uploaded_by = auth.uid()
      and d.superseded_at is null
    order by d.created_at desc
    limit p_limit
  ),
  counts as (
    select c.document_id, count(*)::int as chunk_count
    from public.corpus_chunks c
    where c.document_id in (select id from docs)
    group by c.document_id
  ),
  expanded as (
    select d.id
    from docs d
    join counts c on c.document_id = d.id
    where d.status = 'pending' and c.chunk_count > 0
    order by d.created_at desc
    limit 1
  ),
  chunks_by_doc as (
    select
      c.document_id,
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'heading', c.heading,
          'text', c.text,
          'citation', c.citation,
          'questions', coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id', q.id, 'level', q.level, 'prompt', q.prompt,
                  'question', q.question, 'status', q.status
                ) order by q.created_at
              )
              from public.generated_questions q
              where q.chunk_id = c.id and q.status <> 'rejected'
            ),
            '[]'::jsonb
          )
        )
        order by coalesce((regexp_match(c.citation, '(\d+)\s*$'))[1]::int, 0)
      ) as chunks
    from public.corpus_chunks c
    where c.document_id in (select id from expanded)
    group by c.document_id
  )
  select jsonb_build_object(
    'user', (select to_jsonb(m) from me m),
    'documents', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'source_file', d.source_file,
            'status', d.status,
            'created_at', d.created_at,
            'version', d.version,
            'chunkCount', coalesce(c.chunk_count, 0),
            'chunks', coalesce(cb.chunks, '[]'::jsonb)
          ) order by d.created_at desc
        )
        from docs d
        left join counts c on c.document_id = d.id
        left join chunks_by_doc cb on cb.document_id = d.id
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.teacher_ingest_state(int) from public, anon;
grant execute on function public.teacher_ingest_state(int) to authenticated;
