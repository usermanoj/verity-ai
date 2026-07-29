-- Teacher corrections for the two things the model writes in Chinese:
-- glossary entries and translations.
--
-- Both are generated, both are shown to children, and until now neither could
-- be fixed. A wrong gloss stayed wrong for every student who hovered it, and
-- the only remedy for a bad translation was to stop using Translate. A
-- curriculum product cannot ask a school to trust output no teacher can edit.
--
-- The translation memory is the other half. Translation already runs at
-- temperature 0, so the same passage always produces the same Chinese — and
-- is paid for on every single tap. Storing it makes repeats free and instant,
-- and gives a correction somewhere to live: once a teacher fixes a passage,
-- every future student sees the fixed version rather than the model's.

-- 1. Glossary entries become editable in place, with provenance.
alter table public.corpus_glossary
  add column if not exists edited_by uuid references public.users (id) on delete set null,
  add column if not exists edited_at timestamptz,
  -- Hidden rather than deleted: a teacher rejecting a term is a judgement
  -- worth keeping, and re-running a backfill must not resurrect it.
  add column if not exists hidden boolean not null default false;

-- 2. Translation memory.
create table if not exists public.translation_memory (
  id uuid primary key default gen_random_uuid(),
  -- The document whose vocabulary shaped this translation. Null for the two
  -- seeded demo topics, whose ids are not uuids.
  document_id uuid references public.corpus_documents (id) on delete cascade,
  -- sha256 of the normalised source, so lookup is an index hit rather than a
  -- comparison of two-thousand-character strings.
  source_hash text not null,
  source_text text not null,
  target_lang text not null default 'zh-Hans',
  translation text not null,
  -- 'teacher' always wins over 'model': a correction is the point.
  origin text not null default 'model' check (origin in ('model', 'teacher')),
  edited_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One entry per (passage, language, document). coalesce because a null
-- document_id would otherwise never collide with itself, and the demo topics
-- would accumulate a new row per tap.
create unique index if not exists translation_memory_key_idx
  on public.translation_memory (
    source_hash,
    target_lang,
    coalesce(document_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.translation_memory enable row level security;

-- Readable exactly where the material is readable — a translation is the
-- material, in another language.
drop policy if exists "translation memory readable with its document" on public.translation_memory;
create policy "translation memory readable with its document"
  on public.translation_memory for select
  using (
    document_id is null
    or exists (
      select 1 from public.corpus_documents d
      where d.id = translation_memory.document_id
        and d.status = 'approved'
    )
  );

-- Writes go through the functions below; no direct insert/update is granted.

-- 3. Correcting a glossary entry.
--
-- SECURITY DEFINER with the ownership test stated in one place, the same
-- pattern as every other teacher-scoped write here. A teacher may correct the
-- vocabulary of a document they uploaded, and nothing else.
create or replace function public.save_glossary_edit(
  p_id uuid,
  p_en text,
  p_zh text,
  p_hidden boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  select exists (
    select 1
    from public.corpus_glossary g
    join public.corpus_documents d on d.id = g.document_id
    where g.id = p_id
      and d.uploaded_by = auth.uid()
  ) into v_allowed;

  if not v_allowed then
    return false;
  end if;

  update public.corpus_glossary
  set
    -- Blank means "leave it": a teacher hiding a term should not have to
    -- retype the definition to do it.
    en = coalesce(nullif(btrim(p_en), ''), en),
    zh = coalesce(nullif(btrim(p_zh), ''), zh),
    hidden = coalesce(p_hidden, hidden),
    edited_by = auth.uid(),
    edited_at = now()
  where id = p_id;

  return true;
end;
$$;

revoke all on function public.save_glossary_edit(uuid, text, text, boolean) from public;
grant execute on function public.save_glossary_edit(uuid, text, text, boolean) to authenticated;

-- 4. Correcting a translation.
--
-- Upserts, because the model has usually stored its own attempt for this
-- passage already and the teacher's version replaces it.
create or replace function public.save_translation_correction(
  p_document_id uuid,
  p_source_hash text,
  p_source_text text,
  p_target_lang text,
  p_translation text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  select exists (
    select 1 from public.corpus_documents d
    where d.id = p_document_id
      and d.uploaded_by = auth.uid()
  ) into v_allowed;

  if not v_allowed or btrim(p_translation) = '' then
    return false;
  end if;

  insert into public.translation_memory
    (document_id, source_hash, source_text, target_lang, translation, origin, edited_by)
  values
    (p_document_id, p_source_hash, p_source_text, coalesce(p_target_lang, 'zh-Hans'),
     btrim(p_translation), 'teacher', auth.uid())
  on conflict (source_hash, target_lang, coalesce(document_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set
    translation = excluded.translation,
    origin = 'teacher',
    edited_by = excluded.edited_by,
    updated_at = now();

  return true;
end;
$$;

revoke all on function public.save_translation_correction(uuid, text, text, text, text) from public;
grant execute on function public.save_translation_correction(uuid, text, text, text, text) to authenticated;

-- 5. What a teacher is allowed to review: their own documents' vocabulary and
-- stored translations, in one call.
create or replace function public.teacher_language_review(p_document_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'owned', exists (
      select 1 from public.corpus_documents d
      where d.id = p_document_id and d.uploaded_by = auth.uid()
    ),
    'glossary', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id, 'term', g.term, 'en', g.en, 'zh', g.zh,
          'hidden', g.hidden, 'edited', g.edited_at is not null
        ) order by g.term
      )
      from public.corpus_glossary g
      join public.corpus_documents d on d.id = g.document_id
      where g.document_id = p_document_id and d.uploaded_by = auth.uid()
    ), '[]'::jsonb),
    'translations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id, 'sourceHash', t.source_hash, 'source', t.source_text,
          'translation', t.translation, 'origin', t.origin, 'targetLang', t.target_lang
        ) order by t.updated_at desc
      )
      from public.translation_memory t
      join public.corpus_documents d on d.id = t.document_id
      where t.document_id = p_document_id and d.uploaded_by = auth.uid()
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.teacher_language_review(uuid) from public;
grant execute on function public.teacher_language_review(uuid) to authenticated;
