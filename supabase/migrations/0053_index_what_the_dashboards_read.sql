-- Indexes for the columns every dashboard filters on.
--
-- Nine of the eleven tables the read side touches have no index on the column
-- their queries actually use. Postgres does NOT index a foreign key, and every
-- one of these columns is either a foreign key or a status flag, so the whole
-- set was missed together.
--
-- None of this hurts today: 93 events, 40 attempts, 224 questions. A
-- sequential scan over ninety-three rows is free, which is exactly why nothing
-- has surfaced it. One class of thirty for one term is roughly 21,600 events —
-- 230 times what is there now — and events gains a row every time any student
-- opens a lesson or scrolls a section, while every dashboard reads it.
--
-- HONESTY ABOUT THE EVIDENCE. There is no EXPLAIN behind this. PostgREST's
-- plan output is disabled on this project and there is no direct Postgres
-- connection, so these are chosen by reading each query's filters and matching
-- an index to them, not by watching a planner change its mind. What was
-- measured is in scripts/audit-db-scale.mts: the row counts above, and read
-- latency that is currently all network round trip and therefore says nothing
-- about query cost either way.
--
-- Every column below was confirmed against a real query — either a filter in
-- one of the SQL functions, or an .eq()/.in() in the application. Nothing is
-- indexed on speculation, because an index that no query uses is pure cost on
-- every insert.
--
-- Safe to re-run, and safe to run while the app is live: `if not exists`
-- throughout, and creating an index on tables this small is instant.

-- The only reader of public.events is teacher_student_reading (0048), which
-- filters user_id AND type AND a 120-day window. One composite in that order
-- serves it exactly: equality columns first, the range last.
create index if not exists events_user_type_created_idx
  on public.events (user_id, type, created_at desc);

-- The teacher panel fetches every question for a deck's chunks with
-- .in("chunk_id", …) and then splits them by status; the practice bank filters
-- approved. Leading with chunk_id serves both that and chunk_id alone.
create index if not exists generated_questions_chunk_status_idx
  on public.generated_questions (chunk_id, status);

-- Every tutor reply reads the conversation's prior turns in order.
create index if not exists conversation_turns_conversation_idx
  on public.conversation_turns (conversation_id, created_at);

create index if not exists conversations_student_idx
  on public.conversations (student_id);

-- NOT ADDED, because they already exist under other names and a duplicate
-- index is pure cost on every insert:
--   corpus_chunks (document_id)   — covered by corpus_chunks_module_idx,
--                                   which leads with document_id
--   corpus_documents (uploaded_by) — covered by corpus_documents_name_idx
--   corpus_documents (status)      — covered by corpus_documents_current_idx
-- The first draft of this migration added all three before their definitions
-- were read rather than their names.

-- Inside document_reaches_me, which the corpus_chunks policy evaluates PER ROW
-- for a student. Reading a sixty-section deck runs this sixty times, and each
-- run joins documents to sections to enrolments. class_enrollments is already
-- covered by its primary key; these two sides were not.
create index if not exists corpus_document_sections_document_idx
  on public.corpus_document_sections (document_id);
create index if not exists corpus_document_sections_class_idx
  on public.corpus_document_sections (class_id);

-- i_am_staff and class_in_my_school resolve a user's school and role. Four
-- rows today; one row per person in the school once it is sold.
create index if not exists users_school_role_idx
  on public.users (school_id, role);

create index if not exists classes_school_idx
  on public.classes (school_id);
create index if not exists classes_teacher_idx
  on public.classes (teacher_id);

-- Keeps the planner's estimates honest immediately rather than at whatever
-- point autovacuum next looks. Cheap at this size.
analyze public.events;
analyze public.generated_questions;
analyze public.conversation_turns;
analyze public.corpus_chunks;
analyze public.corpus_document_sections;
