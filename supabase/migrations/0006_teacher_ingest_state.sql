-- Verity AI — single-call state for the teacher ingest screen (Phase 2 perf)
--
-- Apply AFTER 0001–0005.
--
-- Why: loading /teacher/ingest cost up to FIVE sequential Postgres round
-- trips — the users row (for the role gate), the document list, chunk counts,
-- the chunk text for the one deck under review, and that deck's questions.
-- Measured in production at ~577ms warm (auth 99ms + db 401ms) for four
-- documents. Each hop is small; it's the serialisation that costs. This
-- returns all of it in one call.
--
-- Identity comes from auth.uid(), NOT a parameter, so a caller can never ask
-- for another teacher's data. SECURITY DEFINER is what lets it read without
-- tripping the circular RLS composition on corpus_documents /
-- corpus_document_sections (see 0004) — the identity check above is the real
-- boundary, exactly as it is in the application code today.

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
    select d.id, d.source_file, d.status, d.created_at
    from public.corpus_documents d
    where d.uploaded_by = auth.uid()
    order by d.created_at desc
    limit p_limit
  ),
  counts as (
    select c.document_id, count(*)::int as chunk_count
    from public.corpus_chunks c
    where c.document_id in (select id from docs)
    group by c.document_id
  ),
  -- Only the single deck currently up for review ships its text; every other
  -- deck sends a count and loads on expand. Mirrors the client's default.
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
        -- Reading order: the trailing number in the citation is the
        -- page/slide, so sort on it numerically (plain text sort would put
        -- page 10 before page 2).
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

-- Callable only by a signed-in user (identity is auth.uid()); never anon.
revoke all on function public.teacher_ingest_state(int) from public, anon;
grant execute on function public.teacher_ingest_state(int) to authenticated;
