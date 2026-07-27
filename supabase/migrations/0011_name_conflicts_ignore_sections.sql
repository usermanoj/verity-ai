-- Verity AI — a filename collides on its name alone
--
-- Apply AFTER 0001–0010.
--
-- Why: 0008 only treated a repeated filename as a conflict when the new
-- upload targeted a section the existing document also targeted. Upload the
-- same deck to 7B having first uploaded it to 7A — or to a new academic year
-- — and the check silently passed, producing a second document with an
-- identical name. Students then saw "Magnets and Electromagnets" listed three
-- times with nothing to tell them apart.
--
-- Section overlap was the wrong test. A teacher who uploads a file they have
-- uploaded before means one of two things, and neither depends on which
-- class it is for: this replaces the old one, or it is a new edition. So the
-- conflict is now keyed on the teacher and the filename, and the answer is
-- the teacher's to give either way.
--
-- Only the two lookups change; everything else matches 0008.

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

  foreach v_file in array p_files loop
    if v_file = any(v_seen) then
      return jsonb_build_object(
        'error',
        format('"%s" was selected twice in the same upload. Upload it once.', v_file)
      );
    end if;
    v_seen := v_seen || v_file;
  end loop;

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

  -- PASS 1 — detect conflicts on the teacher's own documents by NAME. No
  -- section-overlap test: see the header note.
  foreach v_file in array p_files loop
    select d.* into v_existing
    from public.corpus_documents d
    where d.uploaded_by = v_user.id
      and d.source_file = v_file
      and d.superseded_at is null
    order by d.version desc, d.created_at desc
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

  -- PASS 2 — write.
  foreach v_file in array p_files loop
    select d.* into v_existing
    from public.corpus_documents d
    where d.uploaded_by = v_user.id
      and d.source_file = v_file
      and d.superseded_at is null
    order by d.version desc, d.created_at desc
    limit 1;

    v_choice := coalesce(p_resolutions ->> v_file, 'new');

    if v_existing.id is not null and v_choice = 'replace' then
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

-- ONE-OFF CLEANUP of the duplicates created before this check existed.
--
-- Keeps the newest document for each (teacher, filename) and marks the rest
-- superseded rather than deleting them: the older ones may hold a teacher's
-- approvals, and hiding them is reversible where dropping them is not. They
-- disappear from student views and from the teacher list immediately.
with ranked as (
  select
    id,
    first_value(id) over (
      partition by uploaded_by, source_file
      order by created_at desc
    ) as keep_id
  from public.corpus_documents
  where superseded_at is null
)
update public.corpus_documents d
set superseded_at = now(), superseded_by = r.keep_id
from ranked r
where d.id = r.id
  and r.id <> r.keep_id;
