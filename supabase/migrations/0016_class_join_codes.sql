-- Verity AI — class join codes
--
-- Apply AFTER 0001–0015.
--
-- Single sign-on answers "who is this?" and says nothing about "which class
-- are they in?". A student signing in with their school account is verified
-- and still unplaced — and an unplaced student sees nothing, because material
-- is scoped to the classes they are enrolled in (see src/lib/access.ts).
--
-- A join code closes that second gap without anyone importing a roster. The
-- teacher already knows who is in their class; the code simply lets them say
-- so once, and the student's identity still comes from the school's identity
-- provider rather than from the code. Weak identity is the usual objection to
-- join codes, and it does not apply when the code only carries ENROLMENT.
--
-- See docs/student-sign-in.md for why this pairing was chosen over roster
-- import.

create table if not exists public.class_join_codes (
  code text primary key,
  class_id uuid not null references public.classes (id) on delete cascade,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

-- One live code per class. Rotating is revoke-then-create, so a code that
-- leaked into a group chat can be killed without disturbing the students who
-- already joined — their enrolment is a separate row and survives.
create unique index if not exists class_join_codes_one_live
  on public.class_join_codes (class_id)
  where revoked_at is null;

create index if not exists class_join_codes_class_idx on public.class_join_codes (class_id);

-- Service-role only, like the rest of the corpus tables: every read goes
-- through a role-checked function below.
alter table public.class_join_codes enable row level security;

-- Ambiguous glyphs are removed on purpose. A code is read off a whiteboard or
-- a projector by twelve-year-olds, and 0/O and 1/I/L are where that goes
-- wrong. 31 characters over 8 positions is ~10^12 combinations, which is not
-- guessable at any rate a school network would tolerate.
create or replace function public.generate_join_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', floor(random() * 31)::int + 1, 1),
    ''
  )
  from generate_series(1, 8);
$$;

-- ───────────────────────────────────────────────────────────── teacher

-- The teacher's own sections, each with its live code if one exists.
create or replace function public.teacher_class_codes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id from public.users where id = auth.uid() and role = 'teacher'
  )
  select coalesce(jsonb_agg(x order by x->>'subject', x->>'grade', x->>'section'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'classId', cl.id,
      'section', cl.section_name,
      'subject', co.subject,
      'grade', co.grade,
      'academicYear', co.academic_year,
      'code', (
        select j.code from public.class_join_codes j
        where j.class_id = cl.id and j.revoked_at is null
        limit 1
      ),
      'students', (
        select count(*) from public.class_enrollments e where e.class_id = cl.id
      )
    ) as x
    from public.classes cl
    join public.courses co on co.id = cl.course_id
    join me on me.id = cl.teacher_id
  ) rows;
$$;

revoke all on function public.teacher_class_codes() from public, anon;
grant execute on function public.teacher_class_codes() to authenticated;

-- Creates a code, or replaces the existing one. Same call for both, because
-- to a teacher "get me a code" and "get me a new code" are one action.
create or replace function public.rotate_class_code(p_class_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_teacher uuid;
  v_code text;
  v_attempt int := 0;
begin
  select cl.teacher_id into v_teacher
  from public.classes cl
  join public.users u on u.id = auth.uid() and u.role = 'teacher'
  where cl.id = p_class_id;

  -- A teacher may only issue codes for their own sections. Without this, any
  -- teacher could mint a code into a colleague's class and enrol students
  -- into material that isn't theirs.
  if v_teacher is null or v_teacher <> auth.uid() then
    return jsonb_build_object('error', 'That class is not yours.');
  end if;

  update public.class_join_codes
  set revoked_at = now()
  where class_id = p_class_id and revoked_at is null;

  -- Collisions are vanishingly unlikely but not impossible, and the primary
  -- key would raise rather than retry on its own.
  loop
    v_attempt := v_attempt + 1;
    v_code := public.generate_join_code();
    begin
      insert into public.class_join_codes (code, class_id, created_by)
      values (v_code, p_class_id, auth.uid());
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        return jsonb_build_object('error', 'Could not create a code. Please try again.');
      end if;
    end;
  end loop;

  return jsonb_build_object('code', v_code);
end;
$$;

revoke all on function public.rotate_class_code(uuid) from public, anon;
grant execute on function public.rotate_class_code(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────── student

-- Redeems a code for the signed-in user. Identity is already established by
-- the time this runs — the code adds enrolment, nothing else.
create or replace function public.redeem_join_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user public.users;
  v_class public.classes;
  v_course public.courses;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null then
    return jsonb_build_object('error', 'Please sign in first.');
  end if;

  select cl.* into v_class
  from public.class_join_codes j
  join public.classes cl on cl.id = j.class_id
  -- Typed in from a whiteboard: case and stray spaces are the student's
  -- reality, not an error worth refusing.
  where j.code = upper(trim(p_code))
    and j.revoked_at is null
    and (j.expires_at is null or j.expires_at > now());

  if v_class.id is null then
    return jsonb_build_object('error', 'That code is not valid. Check it with your teacher.');
  end if;

  -- A code from another school must not work, whatever it says. Every user is
  -- provisioned into a school at first sign-in, so this is always comparable.
  if v_class.school_id <> v_user.school_id then
    return jsonb_build_object('error', 'That code is not valid. Check it with your teacher.');
  end if;

  -- Idempotent: a student who taps the link twice, or re-enters a code they
  -- already used, should be told they are in the class, not that they failed.
  insert into public.class_enrollments (class_id, student_id)
  values (v_class.id, v_user.id)
  on conflict (class_id, student_id) do nothing;

  select * into v_course from public.courses where id = v_class.course_id;

  return jsonb_build_object(
    'joined', true,
    'section', v_class.section_name,
    'subject', v_course.subject,
    'grade', v_course.grade
  );
end;
$$;

revoke all on function public.redeem_join_code(text) from public, anon;
grant execute on function public.redeem_join_code(text) to authenticated;
