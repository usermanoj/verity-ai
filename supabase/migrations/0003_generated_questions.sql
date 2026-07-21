-- Verity AI — AI-generated practice questions (Phase 1, task #24)
--
-- Same caveat as prior migrations: not yet applied or tested against a real
-- Postgres instance. Apply after 0001_init.sql and 0002_ingestion_storage.sql.
--
-- Not in ROADMAP.md §2's original sketch data model (practice_attempts
-- there references question_id generically, implying questions could come
-- from anywhere). This table is the concrete "AI-generated, pending teacher
-- approval" source — it doesn't replace the static practice-banks.ts
-- questions used by PracticeZone.tsx today; see ROADMAP.md §7 for the
-- explicit scoping boundary (approved rows here are not yet wired into the
-- student-facing practice UI — that's the same static-to-Postgres swap
-- already flagged as future work for the corpus/content-repo).

create table if not exists public.generated_questions (
  id uuid primary key default gen_random_uuid(),
  chunk_id uuid not null references public.corpus_chunks (id) on delete cascade,
  level text not null check (level in ('Easy', 'Medium', 'Challenge')),
  prompt text not null,
  -- Matches src/lib/grade.ts's Question type exactly (numeric | mcq) so an
  -- approved row can be consumed by the existing deterministic grader
  -- without any translation step.
  question jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  generated_by uuid references public.users (id),
  approved_by uuid references public.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.generated_questions enable row level security;

-- Readable by anyone in the chunk's school once approved; the generating/
-- reviewing teacher can also see their own pending/rejected rows while
-- working through the review flow.
create policy generated_questions_select on public.generated_questions
  for select using (
    status = 'approved'
    and chunk_id in (
      select cc.id from public.corpus_chunks cc
      join public.corpus_documents cd on cd.id = cc.document_id
      join public.classes c on c.id = cd.class_id
      where c.school_id = (select school_id from public.current_app_user())
    )
    or generated_by = auth.uid()
  );

create policy generated_questions_insert on public.generated_questions
  for insert with check (generated_by = auth.uid());

create policy generated_questions_update on public.generated_questions
  for update using (generated_by = auth.uid());
