-- Letting a school add its own staff.
--
-- staff_allowlist has existed since 0005 and has only ever been writable by
-- hand in the SQL editor. That is the single largest thing standing between this
-- and a pilot: a school cannot onboard a teacher without someone with database
-- credentials, which means it cannot be handed over at all.
--
-- Three things were missing, and all three are here: a way to invite, a way to
-- withdraw that actually takes effect, and a way for the first principal to
-- exist without a database prompt (the env-var bootstrap, read in the auth
-- callback — see BOOTSTRAP_PRINCIPAL_EMAILS).
--
-- The permission rules are ALSO implemented in src/lib/staff.ts. Not for the
-- sake of duplication: a rule that lives only in TypeScript is one a future
-- route handler can forget to call, and a rule that lives only here cannot tell
-- the interface which buttons to show. These functions are the boundary; the
-- TypeScript is the interface.
--
-- Deliberately NOT domain-based ("anyone @school.edu.sg is a teacher"). At an
-- international school students usually share the staff domain, so a domain rule
-- would hand a class's transcripts to any pupil who signed in. Per-person
-- invitation is slower and is the only version that is safe.

alter table public.staff_allowlist
  -- Who issued this grant. Null for a bootstrap principal, which nobody issued.
  add column if not exists invited_by uuid references public.users (id) on delete set null,
  add column if not exists invited_at timestamptz not null default now(),
  -- Set when the invited person actually signs in, so an invitation that was
  -- sent to the wrong address is visibly distinct from one that was taken up.
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by uuid references public.users (id) on delete set null,
  -- Withdrawal is a soft delete on purpose. A school needs to be able to answer
  -- "who had access to this class in March", and a deleted row cannot.
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.users (id) on delete set null,
  add column if not exists source text not null default 'invite'
    check (source in ('invite', 'bootstrap', 'seed'));

-- Rows that predate this migration were inserted by hand.
update public.staff_allowlist set source = 'seed' where source = 'invite' and invited_by is null;

-- The staff list for the caller's school, with what the caller may do to it.
--
-- isSelf is computed here rather than in the app because the address lives in
-- auth.users, which no client may read. The app decides permission; this decides
-- identity.
create or replace function public.staff_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select u.id, u.role, u.school_id, (select au.email from auth.users au where au.id = u.id) as email
    from public.users u
    where u.id = auth.uid() and u.role in ('hod', 'principal')
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'email', a.email,
        'role', a.role,
        'source', a.source,
        'invitedAt', a.invited_at,
        'invitedBy', (select inv.display_name from public.users inv where inv.id = a.invited_by),
        'claimedAt', a.claimed_at,
        'claimedName', (select c.display_name from public.users c where c.id = a.claimed_by),
        'revokedAt', a.revoked_at,
        'revokedBy', (select r.display_name from public.users r where r.id = a.revoked_by),
        'isSelf', lower(a.email) = lower((select email from me))
      )
      order by a.revoked_at nulls first, a.role, a.email
    ),
    '[]'::jsonb
  )
  from public.staff_allowlist a
  join me on me.school_id = a.school_id;
$$;

revoke all on function public.staff_list() from public, anon;
grant execute on function public.staff_list() to authenticated;

-- Issues a grant, or restores one that was withdrawn.
--
-- Returns an error code rather than raising, so the interface can say something
-- specific. A form that reports "something went wrong" for a permission problem
-- teaches the person nothing about what they are allowed to do.
create or replace function public.invite_staff(p_email text, p_role text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_email text := lower(btrim(p_email));
begin
  select u.id, u.role, u.school_id into v_actor
  from public.users u where u.id = auth.uid() and u.role in ('hod', 'principal');

  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  if p_role not in ('teacher', 'hod', 'principal') then
    return jsonb_build_object('ok', false, 'error', 'bad_role');
  end if;

  -- The hierarchy, enforced here and not only in the interface. An HOD may
  -- bring in teachers; only a principal appoints leadership. So no staff member
  -- can manufacture a peer with authority over them.
  if v_actor.role = 'hod' and p_role <> 'teacher' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_email');
  end if;

  -- Re-inviting a withdrawn address clears the withdrawal rather than failing.
  -- A teacher who leaves and returns is the ordinary case in a school.
  insert into public.staff_allowlist as s (email, school_id, role, invited_by, invited_at, source)
  values (v_email, v_actor.school_id, p_role, v_actor.id, now(), 'invite')
  on conflict (email) do update
    set role = p_role,
        invited_by = v_actor.id,
        invited_at = now(),
        revoked_at = null,
        revoked_by = null
    where s.school_id = v_actor.school_id;

  if not found then
    -- The address belongs to another school's list. Reported as taken rather
    -- than as a permission failure, and without saying which school — the
    -- existence of an account elsewhere is not this caller's business.
    return jsonb_build_object('ok', false, 'error', 'taken');
  end if;

  -- Someone already signed in as a student before being invited: a real case,
  -- since a new teacher may well have looked at the app first. Promote them now
  -- rather than making them sign out and back in to receive it.
  update public.users u
  set role = p_role
  from auth.users au
  where au.id = u.id and lower(au.email) = v_email and u.school_id = v_actor.school_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.invite_staff(text, text) from public, anon;
grant execute on function public.invite_staff(text, text) to authenticated;

-- Withdraws a grant, and takes effect immediately.
--
-- The callback used to refuse to downgrade anyone not on the allowlist, which
-- made withdrawal meaningless: the row was marked and the person kept their
-- role forever. Their role is dropped to student here, in the same statement,
-- so "revoked" means revoked and not "revoked at some future sign-in".
create or replace function public.revoke_staff(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_grant record;
  v_email text := lower(btrim(p_email));
begin
  select u.id, u.role, u.school_id, (select au.email from auth.users au where au.id = u.id) as email
  into v_actor
  from public.users u where u.id = auth.uid() and u.role in ('hod', 'principal');

  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  select * into v_grant from public.staff_allowlist
  where email = v_email and school_id = v_actor.school_id;

  if v_grant is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Nobody removes their own access. A principal who does it by mistake locks
  -- the school out of its own staff list, recoverable only through the env var
  -- and a redeploy.
  if lower(v_grant.email) = lower(v_actor.email) then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;

  -- A bootstrap principal is held in an environment variable. Marking the row
  -- would appear to work and be undone at their next sign-in, and a control
  -- that silently does nothing is how people come to believe access was
  -- removed when it was not.
  if v_grant.source = 'bootstrap' then
    return jsonb_build_object('ok', false, 'error', 'bootstrap');
  end if;

  if v_actor.role = 'hod' and v_grant.role <> 'teacher' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  update public.staff_allowlist
  set revoked_at = now(), revoked_by = v_actor.id
  where email = v_email and school_id = v_actor.school_id;

  -- Immediately, not at next sign-in.
  update public.users u
  set role = 'student'
  from auth.users au
  where au.id = u.id and lower(au.email) = v_email and u.school_id = v_actor.school_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.revoke_staff(text) from public, anon;
grant execute on function public.revoke_staff(text) to authenticated;
