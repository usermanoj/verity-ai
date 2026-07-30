-- A ceiling on what the AI can be made to spend.
--
-- What existed was a per-IP sliding window in an in-memory Map in src/proxy.ts,
-- and its own comment admitted the limitation. On Vercel it is close to
-- ineffective: the Map lives inside one warm serverless instance, so it does
-- not coordinate across instances or regions, and a cold start resets it.
--
-- It is also keyed on the wrong thing. A class of thirty on one school NAT
-- shares a single bucket — twenty requests a minute for the entire school —
-- while anyone distributing requests across addresses gets the full allowance
-- per address. Both directions are wrong: it throttles the paying school and
-- waves through the abuse.
--
-- Counting per PERSON per DAY in Postgres fixes both. It survives cold starts,
-- coordinates across regions because there is one database, and a shared school
-- connection stops being a penalty.
--
-- The per-IP burst limiter stays. It is the only thing standing in front of an
-- UNAUTHENTICATED request, and this table cannot count someone who has no
-- account. The two answer different questions: that one bounds a burst, this
-- one bounds a day.

create table if not exists public.ai_usage (
  user_id uuid not null references public.users (id) on delete cascade,
  day date not null,
  -- 'tutor' | 'translate'. Free-text rather than an enum so adding a kind
  -- never needs a migration; the limits live in TypeScript where they can be
  -- tested and tuned without one.
  kind text not null,
  calls integer not null default 0,
  primary key (user_id, day, kind)
);

-- Every read of this table is "today, for one person" or "today, everyone",
-- so day leads.
create index if not exists ai_usage_day_idx on public.ai_usage (day);

alter table public.ai_usage enable row level security;

-- No policies. Nothing reads this through RLS: the routes go through the
-- function below, and a student has no business reading their own counter —
-- knowing exactly how many calls remain is an invitation to spend them.

-- Counts one call and reports where that leaves things.
--
-- Increments FIRST and lets the caller decide, rather than taking a limit as
-- an argument. Two reasons: the limits are policy and belong in TypeScript
-- next to their tests, and an increment that always happens cannot be raced
-- into allowing two calls at once. A rejected call is still counted, which is
-- deliberate — a request that reached this point may already have cost tokens,
-- and someone hammering a closed door should stay outside it.
create or replace function public.claim_ai_call(p_kind text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_role text;
  v_user_calls integer;
  v_school_calls integer;
begin
  select role into v_role from public.users where id = auth.uid();

  -- No account, no allowance. The routes authenticate before calling this, so
  -- reaching here without a row means the caller is not who they claimed.
  if v_role is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_account');
  end if;

  insert into public.ai_usage (user_id, day, kind, calls)
  values (auth.uid(), current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update set calls = public.ai_usage.calls + 1
  returning calls into v_user_calls;

  -- Every account's calls today, all kinds. This is the figure that actually
  -- protects the bill: a per-person cap still multiplies by the number of
  -- people, and thirty students inside their own limits can empty a small
  -- balance between them.
  --
  -- Not scoped to a school id: this deployment serves one school, and a sum
  -- that silently covered only part of the traffic would be worse than an
  -- honest total. Add the scope with the second school, not before.
  select coalesce(sum(calls), 0) into v_school_calls
  from public.ai_usage where day = current_date;

  return jsonb_build_object(
    'allowed', true,
    'role', v_role,
    'userCalls', v_user_calls,
    'schoolCalls', v_school_calls
  );
end;
$$;

revoke all on function public.claim_ai_call(text) from public, anon;
grant execute on function public.claim_ai_call(text) to authenticated;
