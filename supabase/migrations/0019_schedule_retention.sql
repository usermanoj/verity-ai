-- Verity AI — actually enforce the retention policy
--
-- Apply AFTER 0001–0018.
--
-- 0017 added purge_old_conversations() and deliberately did not schedule it:
-- a destructive job that switches itself on inside a migration is not
-- something to bury. But an unscheduled one means the 400-day limit in
-- docs/student-sign-in.md is a statement of intent rather than a fact about
-- the database, and a school's data protection officer is entitled to ask
-- which it is. This makes it a fact.
--
-- If `create extension pg_cron` fails, enable pg_cron first in the Supabase
-- dashboard under Database → Extensions, then re-run this file.

create extension if not exists pg_cron;

-- Evidence that the policy ran, not just that it exists.
--
-- "We delete conversations after 400 days" is a promise. A table showing when
-- deletion last ran and how many rows it removed is the thing that answers
-- the question. Deliberately tiny and append-only: it records the fact of a
-- deletion, never what was deleted.
create table if not exists public.retention_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  days_kept int not null,
  conversations_deleted int not null
);

alter table public.retention_runs enable row level security;

create or replace function public.run_retention(p_days int default 400)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  v_deleted := public.purge_old_conversations(p_days);
  insert into public.retention_runs (days_kept, conversations_deleted)
  values (p_days, v_deleted);
  return v_deleted;
end;
$$;

revoke all on function public.run_retention(int) from public, anon, authenticated;

-- Unschedule first so this file can be re-run without colliding with an
-- existing job of the same name.
do $$
begin
  perform cron.unschedule('verity-retention');
exception when others then
  -- No such job yet, which is the normal case on a first run.
  null;
end;
$$;

-- Daily rather than weekly: it keeps each deletion small and bounded instead
-- of removing a week of conversations in one transaction a year from now.
--
-- 18:00 UTC is 02:00 in Singapore — outside school hours for the first
-- market, so a large delete never lands in the middle of a lesson.
select cron.schedule(
  'verity-retention',
  '0 18 * * *',
  $$select public.run_retention(400)$$
);

-- Check it is registered:
--   select jobname, schedule, active from cron.job where jobname = 'verity-retention';
--
-- Check it has been running:
--   select * from public.retention_runs order by ran_at desc limit 10;
--
-- Nothing will be deleted for a long time — the oldest conversation in this
-- database is days old, not 400. An empty retention_runs table after tomorrow
-- would mean the job is not firing; rows with conversations_deleted = 0 are
-- the expected, healthy state.
