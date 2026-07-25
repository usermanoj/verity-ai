-- Verity AI — single-call upload authorisation (Phase 2 perf)
--
-- Apply AFTER 0001–0006.
--
-- Why: POST /api/ingest/upload-init cost ~7 sequential Postgres round trips
-- before the browser could send a byte — the caller's users row (role gate),
-- get-or-create the course, get-or-create each section, insert the documents,
-- insert the document↔section mappings. Measured live at 2272ms of a 6680ms
-- upload. Each hop is small; the serialisation is the cost. This does all of
-- it in one call.
--
-- Identity comes from auth.uid() inside the function, never a parameter, so a
-- caller cannot act as another teacher. SECURITY DEFINER is required to write
-- through the same RLS composition the app already bypasses server-side (see
-- 0004); the auth.uid() checks below are the real boundary.

create or replace function public.teacher_upload_init(
  p_subject text,
  p_grade text,
  p_academic_year text,
  p_sections text[],
  p_files text[]
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
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null then
    return jsonb_build_object('error', 'Not signed in.');
  end if;
  if v_user.role <> 'teacher' then
    return jsonb_build_object('error', 'Only signed-in teachers can upload.');
  end if;

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

    -- A concurrent upload may have created it between the select and insert.
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

  -- Documents, plus their section mappings. Kept in one loop so the returned
  -- order matches p_files exactly — the caller zips signed URLs by index, and
  -- duplicate filenames rule out matching by name.
  foreach v_file in array p_files loop
    insert into public.corpus_documents (uploaded_by, source_file, status)
    values (v_user.id, v_file, 'pending')
    returning id into v_doc_id;

    insert into public.corpus_document_sections (document_id, class_id)
    select v_doc_id, unnest(v_class_ids);

    v_docs := v_docs || jsonb_build_object('id', v_doc_id, 'name', v_file);
  end loop;

  return jsonb_build_object('documents', v_docs);
end;
$$;

revoke all on function public.teacher_upload_init(text, text, text, text[], text[]) from public, anon;
grant execute on function public.teacher_upload_init(text, text, text, text[], text[]) to authenticated;
