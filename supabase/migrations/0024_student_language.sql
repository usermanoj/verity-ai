-- A student's reading level, as a property of the student rather than of the
-- browser they happen to be sitting at.
--
-- The two controls in the tutor panel were remembered in localStorage, which
-- means: lost on a shared classroom tablet, lost on the library computer, and
-- invisible to the teacher. A child who needs the easiest English had to know
-- to find a dropdown and re-find it on every device — and the one adult who
-- actually knows they need it had no way to set it for them.
--
-- Stored on the user so it follows them, and settable by the teacher who
-- teaches them.

alter table public.users
  add column if not exists esl_level text not null default 'intermediate'
    check (esl_level in ('advanced', 'intermediate', 'beginner')),
  -- Chinese glosses are a separate axis from reading level: a strong reader
  -- new to English wants full English WITH 中文.
  add column if not exists esl_chinese boolean not null default false,
  add column if not exists esl_set_by uuid references public.users (id) on delete set null,
  add column if not exists esl_set_at timestamptz;

-- A student setting their own.
--
-- Kept separate from the teacher's function rather than branching inside one:
-- "may I change my own preference" and "may I change this child's preference"
-- are different questions with different answers, and one function answering
-- both is how the second one ends up as an afterthought.
create or replace function public.set_my_language(p_level text, p_chinese boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_level is not null and p_level not in ('advanced', 'intermediate', 'beginner') then
    return false;
  end if;

  update public.users
  set
    esl_level = coalesce(p_level, esl_level),
    esl_chinese = coalesce(p_chinese, esl_chinese),
    -- Deliberately NOT recording the student as the setter: esl_set_by means
    -- "a teacher chose this for them", and the teacher-facing list uses it to
    -- distinguish a considered decision from a default nobody has touched.
    esl_set_by = null,
    esl_set_at = now()
  where id = auth.uid();

  return found;
end;
$$;

revoke all on function public.set_my_language(text, boolean) from public;
grant execute on function public.set_my_language(text, boolean) to authenticated;

-- A teacher setting it for a student they actually teach.
create or replace function public.set_student_language(
  p_student_id uuid,
  p_level text,
  p_chinese boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  if p_level is not null and p_level not in ('advanced', 'intermediate', 'beginner') then
    return false;
  end if;

  -- Enrolled in a section this teacher owns. Not "same school": a teacher
  -- should not be able to reach into another teacher's class and change how a
  -- child is taught.
  select exists (
    select 1
    from public.class_enrollments e
    join public.classes c on c.id = e.class_id
    where e.student_id = p_student_id
      and c.teacher_id = auth.uid()
  ) into v_allowed;

  if not v_allowed then
    return false;
  end if;

  update public.users
  set
    esl_level = coalesce(p_level, esl_level),
    esl_chinese = coalesce(p_chinese, esl_chinese),
    esl_set_by = auth.uid(),
    esl_set_at = now()
  where id = p_student_id
    and role = 'student';

  return found;
end;
$$;

revoke all on function public.set_student_language(uuid, text, boolean) from public;
grant execute on function public.set_student_language(uuid, text, boolean) to authenticated;

-- The students a teacher teaches, with their current setting.
create or replace function public.teacher_student_language()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', coalesce(s.display_name, 'Student'),
        'level', s.esl_level,
        'chinese', s.esl_chinese,
        -- True when a teacher chose it, false when it is still the default.
        -- A list where every row looks decided is a list nobody reviews.
        'setByTeacher', s.esl_set_by is not null,
        'sections', sec.names
      ) order by coalesce(s.display_name, 'Student')
    ),
    '[]'::jsonb
  )
  from public.users s
  join lateral (
    select array_agg(distinct c.section_name order by c.section_name) as names
    from public.class_enrollments e
    join public.classes c on c.id = e.class_id
    where e.student_id = s.id
      and c.teacher_id = auth.uid()
  ) sec on true
  where s.role = 'student'
    and sec.names is not null;
$$;

revoke all on function public.teacher_student_language() from public;
grant execute on function public.teacher_student_language() to authenticated;
