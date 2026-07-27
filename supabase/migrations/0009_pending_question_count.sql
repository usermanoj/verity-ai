-- Verity AI — surface questions waiting for teacher approval
--
-- Apply AFTER 0001–0008.
--
-- Why: generated questions land as 'pending' and only reach students once the
-- teacher approves them, but nothing ever told the teacher they existed. The
-- ingest screen expands exactly one document — the newest deck still awaiting
-- CHUNK review — so questions, which are generated after a document is
-- approved, were always attached to a collapsed card. Every generated
-- question sat one status short of a student with no visible prompt to
-- release it, which is why the practice zone was empty on every uploaded
-- topic.
--
-- Adding the count to the list makes the outstanding work visible on the card
-- itself, in the same single round trip the screen already makes.

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
  -- Questions awaiting approval, per document. Counted across the document's
  -- chunks so the card can say "18 questions need your approval" without
  -- shipping any question text.
  pending_questions as (
    select c.document_id, count(*)::int as pending_question_count
    from public.corpus_chunks c
    join public.generated_questions q on q.chunk_id = c.id
    where c.document_id in (select id from docs)
      and q.status = 'pending'
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
            'pendingQuestionCount', coalesce(pq.pending_question_count, 0),
            'chunks', coalesce(cb.chunks, '[]'::jsonb)
          ) order by d.created_at desc
        )
        from docs d
        left join counts c on c.document_id = d.id
        left join pending_questions pq on pq.document_id = d.id
        left join chunks_by_doc cb on cb.document_id = d.id
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.teacher_ingest_state(int) from public, anon;
grant execute on function public.teacher_ingest_state(int) to authenticated;
