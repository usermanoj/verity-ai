-- Verity AI — staff role allowlist (Phase 2)
--
-- Apply AFTER 0001–0004. Replaces the "every teacher is promoted by hand in
-- SQL" step: a pre-approved staff email is assigned its role automatically
-- at sign-in (see src/app/auth/callback/route.ts); everyone else still
-- defaults to student (least privilege). This is the exact seam a future
-- "invite teacher" admin UI writes to — the UI just inserts rows here.
--
-- Emails are stored lower-cased and looked up lower-cased (the callback
-- normalizes), so casing never causes a miss.

create table if not exists public.staff_allowlist (
  email text primary key,
  school_id uuid not null references public.schools (id) on delete cascade,
  role text not null check (role in ('teacher', 'hod', 'principal')),
  created_at timestamptz not null default now()
);

-- Locked down: only the service-role client (the auth callback, and later an
-- admin UI) reads or writes this. RLS enabled with NO policy denies every
-- normal user session — the staff list is not readable by students/teachers
-- through the API. The service role bypasses RLS entirely.
alter table public.staff_allowlist enable row level security;
