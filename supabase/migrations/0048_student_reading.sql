-- Whether a child opened the lesson, and how far through it they got.
--
-- The gap this closes: a student who read carefully for twenty minutes and
-- asked nothing was indistinguishable from one who never opened the page. Both
-- showed as "not started", and they need opposite things — one needs
-- prompting, the other needs a reason to practise.
--
-- WHAT IS NOT STORED
--
-- No timing. The events this reads carry the set of sections that came into
-- view and the length of the lesson, and nothing else: not how long a section
-- was on screen, not how long the page was open, not whether the tab had focus.
-- Those are the obvious things to collect and they are surveillance of a minor.
-- They score a left-open tab as diligence, and once a school holds them it is
-- being asked questions about a child's afternoon it should not be answering.
--
-- The rows are returned raw, one per report, and folded together in TypeScript
-- (lib/reading.ts) — because "a sitting on Monday plus a sitting on Tuesday is
-- ten sections, not six" is a judgement, and judgements about a child belong
-- somewhere a teacher can read them.

create or replace function public.teacher_student_reading(p_student_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    -- Enrolled in a section this member of staff owns. The same rule as
    -- teacher_student_detail and teacher_student_breakdown — not "same
    -- school". Reading behaviour is more intimate than a mark, not less.
    select 1
    from public.class_enrollments e
    join public.classes c on c.id = e.class_id
    join public.users me
      on me.id = auth.uid()
     and me.role in ('teacher', 'hod', 'principal')
    where e.student_id = p_student_id and c.teacher_id = auth.uid()
    limit 1
  )
  select jsonb_build_object(
    'allowed', exists (select 1 from allowed),
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'topicId', ev.payload->>'topicId',
          'sections', coalesce(ev.payload->'sections', '[]'::jsonb),
          'total', coalesce((ev.payload->>'total')::int, 0),
          'at', ev.created_at
        ) order by ev.created_at
      )
      from public.events ev
      where ev.user_id = p_student_id
        and ev.type = 'sections_read'
        and exists (select 1 from allowed)
        -- A term's reading, not a year's. The question a teacher asks is about
        -- the work in front of them.
        and ev.created_at > now() - interval '120 days'
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.teacher_student_reading(uuid) from public, anon;
grant execute on function public.teacher_student_reading(uuid) to authenticated;
