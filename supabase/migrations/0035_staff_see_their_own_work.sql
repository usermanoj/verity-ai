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

-- The candidate set is deliberately a MATERIALIZED cte.
--
-- Without it Postgres is free to evaluate pg_get_functiondef() during the scan
-- of pg_proc, before the schema filter has excluded anything — and that
-- function raises on an aggregate rather than returning null:
--
--   ERROR: "array_agg" is an aggregate function
--
-- The first version of this migration failed exactly that way. `as
-- materialized` forces the filter to run first, and prokind = 'f' keeps
-- aggregates, window functions and procedures out regardless of ordering.
create or replace function pg_temp.definitions_to_widen()
returns table (fn_name text, fn_definition text)
language sql
stable
as $fn$
  with candidates as materialized (
    select p.oid as fn_oid, p.proname::text as fn_name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
      -- 'f' is a plain function: not 'a' aggregate, 'w' window or 'p' procedure.
      and p.prokind = 'f'
      -- Only functions with a body we can read and re-issue.
      and l.lanname in ('sql', 'plpgsql')
  )
  select c.fn_name, pg_get_functiondef(c.fn_oid)
  from candidates c
  where pg_get_functiondef(c.fn_oid) like '%role = ''teacher''%'
  order by c.fn_name;
$fn$;

do $$
declare
  names text[];
  definitions text[];
  i int;
begin
  -- Snapshotted into arrays BEFORE anything is executed. The loop rewrites
  -- pg_proc, and iterating a cursor over the same catalogue it is modifying is
  -- a way to get results nobody can reason about afterwards.
  select array_agg(fn_name), array_agg(fn_definition)
  into names, definitions
  from pg_temp.definitions_to_widen();

  if names is null then
    raise notice 'nothing to widen — already applied';
    return;
  end if;

  for i in 1 .. array_length(names, 1) loop
    -- The substring is unambiguous. Deliberately NOT touching `<> 'teacher'`,
    -- which is 0034's rule that a head of department may only withdraw a
    -- teacher, and is correct as it stands.
    execute replace(
      definitions[i],
      'role = ''teacher''',
      'role in (''teacher'', ''hod'', ''principal'')'
    );
    raise notice 'widened %', names[i];
  end loop;

  raise notice '% function(s) widened', array_length(names, 1);
end $$;

-- Proof, in the same transaction. If any function still carries the old
-- predicate the migration fails rather than reporting success — a half-applied
-- permissions change is worse than none, because the half that works makes the
-- half that does not look like a different problem.
do $$
declare remaining int;
begin
  -- Same helper, so the check cannot drift from what the rewrite looked at —
  -- and cannot hit the aggregate problem either.
  select count(*) into remaining from pg_temp.definitions_to_widen();

  if remaining > 0 then
    raise exception '% function(s) still restricted to role = teacher', remaining;
  end if;

  raise notice 'verified: no function in public is restricted to role = teacher';
end $$;

-- pg_temp is per-session, so this disappears on disconnect. Dropped explicitly
-- anyway: a helper that outlives the migration is a thing someone finds later
-- and cannot explain.
drop function pg_temp.definitions_to_widen();
