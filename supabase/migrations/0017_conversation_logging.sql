-- Verity AI — make conversation logging possible, and disposable
--
-- Apply AFTER 0001–0016.
--
-- The conversations tables have existed since the first migration and have
-- never held a row: nothing wrote to them, because nothing knew who a student
-- was. Now that students sign in and join a class, they can be filled.
--
-- Two changes are needed before that is safe to switch on.

-- 1. class_id was NOT NULL, which cannot represent the two seeded demo topics
-- (sample content belonging to no class) or a student who somehow reaches a
-- topic outside their enrolment. A conversation that cannot be recorded would
-- otherwise have to be silently dropped, and silent drops in an audit trail
-- are worse than a null.
alter table public.conversations alter column class_id drop not null;

-- 2. Retention. This is the part it would be easy to defer and expensive to
-- defer, so it ships with the logging rather than after it.
--
-- A tutor transcript is not telemetry. Once students are identified it is a
-- record of a named child saying what they do not understand, and it needs an
-- answer to "how long do you keep this" and "can a parent have it deleted"
-- BEFORE the first one is written. The default below is one academic year
-- plus a margin: long enough for a teacher to look back over a term, short
-- enough that a transcript does not follow a child through the school.
--
-- Nothing here runs on a schedule automatically — Supabase cron or an
-- external job must call it. That is deliberate: a destructive job that
-- silently enables itself is not something to bury in a migration. See
-- docs/student-sign-in.md.
create index if not exists conversations_started_at_idx on public.conversations (started_at);

create or replace function public.purge_old_conversations(p_days int default 400)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from public.conversations
  where started_at < now() - make_interval(days => p_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Erasure on request — a parent or the school asking for a child's
-- conversations to be removed.
--
-- Deletes the conversations (turns cascade) and the student's practice
-- attempts, and returns what it removed so the request can be answered with a
-- number rather than a reassurance.
create or replace function public.erase_student_history(p_student_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_conversations int;
  v_attempts int;
begin
  delete from public.conversations where student_id = p_student_id;
  get diagnostics v_conversations = row_count;

  delete from public.practice_attempts where student_id = p_student_id;
  get diagnostics v_attempts = row_count;

  return jsonb_build_object('conversations', v_conversations, 'practiceAttempts', v_attempts);
end;
$$;

-- Neither function is granted to `authenticated`. Both are destructive and
-- rare, and are run deliberately with the service role rather than reachable
-- from a session that a misconfigured route could expose.
revoke all on function public.purge_old_conversations(int) from public, anon, authenticated;
revoke all on function public.erase_student_history(uuid) from public, anon, authenticated;
