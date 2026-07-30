-- A principal who runs a class should be able to see that class.
--
-- 0125 made the application's role gates a hierarchy: requireAtLeast("teacher")
-- admits a head of department and a principal, and twelve API routes were
-- widened to match. The SQL was not, and every teacher-facing function still
-- opens with `where id = auth.uid() and role = 'teacher'`.
--
-- The result is the worst of both: the pages open and every panel on them is
-- empty. A principal who uploaded a deck yesterday signs in today and the
-- school dashboard reports zero documents, zero contributing teachers and zero
-- per cent curriculum coverage — all of it wrong, none of it flagged, because
-- an empty result is not an error.
--
-- Found by looking at a screenshot of the real dashboard rather than by
-- testing, which is the same way most of this week's faults were found.
--
-- WIDENING IS SAFE HERE, and it is worth being explicit about why rather than
-- trusting the phrase. Every one of these functions does its real scoping AFTER
-- the role check, by user id: `d.uploaded_by = me.id`, `cl.teacher_id =
-- auth.uid()`. The role test asks "are you staff at all", and the id test asks
-- "is this yours". Widening the first does not loosen the second, so a
-- principal sees exactly their own classes and documents — not the school's.
-- The school-wide view is /principal, which is separately gated on hod and
-- principal and is not touched here.
--
-- Done by rewriting the predicate in place rather than by re-pasting ten
-- function bodies. Copying them out of older migrations would silently revert
-- whatever later migrations changed — 0031 replaced 0030's version of
-- teacher_question_outcomes, and 0027 replaced 0022's class list — and that
-- class of mistake is exactly what this migration exists to fix. Nothing here
-- changes what a function does; only who is allowed to ask.

do $$
declare
  fn record;
  new_definition text;
  changed int := 0;
begin
  for fn in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and pg_get_functiondef(p.oid) like '%role = ''teacher''%'
    order by p.proname
  loop
    -- The substring is unambiguous. Deliberately NOT touching `<> 'teacher'`,
    -- which is 0034's rule that a head of department may only withdraw a
    -- teacher, and is correct as it stands.
    new_definition := replace(
      fn.definition,
      'role = ''teacher''',
      'role in (''teacher'', ''hod'', ''principal'')'
    );
    execute new_definition;
    changed := changed + 1;
    raise notice 'widened %', fn.proname;
  end loop;

  raise notice '% function(s) widened', changed;
end $$;

-- Proof, in the same transaction. If any function still carries the old
-- predicate the migration fails rather than reporting success — a half-applied
-- permissions change is worse than none, because the half that works makes the
-- half that does not look like a different problem.
do $$
declare remaining int;
begin
  select count(*) into remaining
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and pg_get_functiondef(p.oid) like '%role = ''teacher''%';

  if remaining > 0 then
    raise exception '% function(s) still restricted to role = teacher', remaining;
  end if;
end $$;
