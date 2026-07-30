-- Somewhere for a failure to be seen.
--
-- There is no error reporting in this application at all. Every failure so far
-- has been found the same way: by reading production rows and noticing that a
-- number was wrong. Four bugs came from discarded errors — the sign-in
-- callback, the tutor stream, the teacher material list, the practice attempt —
-- and three more in one day came from code that looked correct and failed
-- invisibly: a usage counter failing open, an assistant turn frozen in a
-- suspended instance, a source file quietly becoming binary.
--
-- The pattern is not carelessness, it is the absence of instrumentation. A
-- `catch {}` is a decision that the caller should not be disturbed, which is
-- often right; it should never also be a decision that NOBODY is told.
--
-- Deliberately not Sentry. Sentry is the better tool and should come later, but
-- it needs an account, a DSN and a paid tier to be useful — and an error log
-- that exists today beats a better one that is blocked on signing up. The
-- reporting call site is the part that is expensive to add and tedious to
-- retrofit; swapping where it sends is a one-file change afterwards.
--
-- AGGREGATED BY FINGERPRINT, not one row per occurrence. A retry loop against a
-- failing provider would write thousands of identical rows and the interesting
-- error would be buried in them — and this table must not become its own
-- incident. One row per distinct problem per day, with a count.

create table if not exists public.app_errors (
  -- Hash of the area plus the message with ids and numbers stripped, so
  -- "chunk abc not found" and "chunk def not found" are one problem.
  fingerprint text not null,
  day date not null,
  -- Where it happened: 'tutor', 'translate', 'ai-usage', 'ingest'. Coarse on
  -- purpose — a name someone can act on, not a file path.
  area text not null,
  message text not null,
  detail text,
  count integer not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (fingerprint, day)
);

create index if not exists app_errors_day_idx on public.app_errors (day desc, count desc);

alter table public.app_errors enable row level security;

-- Staff may read. A student has no use for this and it is the one table whose
-- contents are about the product failing rather than about their learning.
drop policy if exists app_errors_select on public.app_errors;
create policy app_errors_select on public.app_errors
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('teacher', 'hod', 'principal')
    )
  );

-- No insert policy. Writes go through record_error below, called server-side
-- with the service-role key, so nothing a browser can reach may write here —
-- an endpoint that lets a caller append arbitrary text to an operations log is
-- an abuse vector, not a feature.

-- Records one occurrence, or increments an identical one from today.
--
-- Takes a fingerprint computed by the caller rather than computing one here:
-- the stripping rules decide what counts as "the same problem", which is a
-- judgement worth having tests around, and those live in TypeScript.
create or replace function public.record_error(
  p_fingerprint text,
  p_area text,
  p_message text,
  p_detail text default null
)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.app_errors as e (fingerprint, day, area, message, detail, count)
  values (p_fingerprint, current_date, p_area, left(p_message, 500), left(p_detail, 2000), 1)
  on conflict (fingerprint, day) do update
    set count = e.count + 1,
        last_seen = now(),
        -- The most recent detail wins. An older stack for the same fingerprint
        -- adds nothing, and keeping the newest means the trace matches the
        -- timestamp beside it.
        detail = coalesce(left(p_detail, 2000), e.detail);
$$;

-- Nobody is granted this. The service-role key bypasses grants, which is
-- exactly the reach it should have: server code can report, browsers cannot.
revoke all on function public.record_error(text, text, text, text) from public, anon, authenticated;
