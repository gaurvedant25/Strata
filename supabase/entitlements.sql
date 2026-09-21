-- Gym Log — subscription tables and functions.
--
-- Run this once in the Supabase SQL editor, on a project that already has
-- `schema.sql`. It is deliberately a second file rather than more of the first:
-- `schema.sql` drops and recreates the row-level-security policy on
-- `gym_records`, and re-running that against a live project just to add an
-- unrelated table puts the only thing standing between two accounts' training
-- logs through a needless drop-and-create. Nothing in here touches
-- `gym_records`.
--
-- Safe to run more than once: every statement is `if not exists`,
-- `or replace`, or a `drop ... if exists` against an object this file owns.

-- ---------------------------------------------------------------------------
-- Entitlements: the Pro preview, and the subscription that may follow it.
--
-- Deliberately NOT a `gym_records` row. Everything in that table is written by
-- the client and reconciled last-write-wins, which is right for a training log
-- and wrong for the one fact a user has an incentive to rewrite. This table is
-- readable by its owner and writable by nobody: the only way a row appears is
-- `start_pro_preview()`, which runs as the definer and stamps the database's
-- own clock.
--
-- That is what makes the preview unrepeatable. Signing out, reinstalling,
-- clearing local storage and winding the device clock forward all leave this
-- row exactly as it was, because none of them can reach it.
--
-- Safe to run on a project that already has the table: every statement below
-- is `if not exists` or `or replace`.

create table if not exists public.gym_entitlements (
  user_id                 uuid primary key references auth.users on delete cascade,
  pro_preview_started_at  timestamptz,
  pro_preview_ends_at     timestamptz,
  pro_preview_consumed    boolean     not null default false,
  subscription_status     text        not null default 'none',
  subscription_expires_at timestamptz,
  entitlement_source      text        not null default 'free',
  updated_at              timestamptz not null default now()
);

/*
 * `cancelled` is a state the client already reads and the table could not hold.
 *
 * A cancelled subscription is paid-for time that has not run out yet: the
 * buyer has turned off renewal, and Pro stays on until the date they already
 * paid through. The app models that — `resolve()` treats it as live, and the
 * Plan row says "Available until" rather than "Renews" — but the constraint
 * only allowed three states, so the first cancellation the Play receipt
 * verifier tried to write would have been rejected by the database and the
 * account would have kept reading as `active` until it expired.
 *
 * Dropped and re-added rather than added conditionally, because the original
 * swallowed `duplicate_object`: on a database that already has the old
 * three-state constraint, an `add` alone would do nothing at all.
 */
alter table public.gym_entitlements
  drop constraint if exists gym_entitlements_status;
alter table public.gym_entitlements
  add constraint gym_entitlements_status
  check (subscription_status in ('none', 'active', 'cancelled', 'expired'));

do $$
begin
  alter table public.gym_entitlements
    add constraint gym_entitlements_source
    check (entitlement_source in ('free', 'pro_preview', 'subscription'));
exception when duplicate_object then null;
end $$;

alter table public.gym_entitlements enable row level security;

-- Read your own row and nothing else. There is deliberately no insert, update
-- or delete policy at all, so the anon key that ships in the bundle cannot
-- start, extend or reset a preview even with a hand-written request.
drop policy if exists "read own entitlement" on public.gym_entitlements;
create policy "read own entitlement" on public.gym_entitlements
  for select to authenticated
  using (auth.uid() = user_id);

/*
 * Start the preview, once, ever.
 *
 * The length is fixed here rather than taken as an argument: a parameter would
 * be a number the client gets to choose, and the client is the party this
 * function exists to not trust.
 *
 * Idempotent by construction. A double-tap on Finish, a second device syncing,
 * and a retry after a failed round trip all land here and all receive the row
 * that already exists rather than a second preview.
 */
create or replace function public.start_pro_preview()
returns public.gym_entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  found public.gym_entitlements;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.gym_entitlements (
    user_id, pro_preview_started_at, pro_preview_ends_at,
    pro_preview_consumed, entitlement_source)
  values (
    auth.uid(), now(), now() + interval '7 days', true, 'pro_preview')
  on conflict (user_id) do nothing;

  select * into found from public.gym_entitlements where user_id = auth.uid();

  -- A row can exist without a preview ever having run: billing creates one the
  -- moment somebody subscribes. That user is still owed their preview if they
  -- ever drop back to free, so it is stamped now — but the source stays
  -- 'subscription' while the subscription is the thing actually paying.
  if found.pro_preview_consumed is not true then
    update public.gym_entitlements
       set pro_preview_started_at = now(),
           pro_preview_ends_at    = now() + interval '7 days',
           pro_preview_consumed   = true,
           entitlement_source     = case
             when subscription_status = 'active' then entitlement_source
             else 'pro_preview' end,
           updated_at             = now()
     where user_id = auth.uid()
     returning * into found;
  end if;

  return found;
end;
$$;

/*
 * The row, plus the clock it should be read against.
 *
 * `server_now` is the whole point: remaining time is worked out against the
 * database's clock, not the phone's, so moving the device clock changes what
 * the app displays by nothing at all.
 *
 * Returns a null entitlement rather than an error when no row exists yet —
 * that is the ordinary state of a user who has not finished a workout.
 */
create or replace function public.get_entitlement()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  found public.gym_entitlements;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select * into found from public.gym_entitlements where user_id = auth.uid();
  return json_build_object(
    'server_now', now(),
    'entitlement',
    case when found.user_id is null then null else to_json(found) end
  );
end;
$$;

revoke all on function public.start_pro_preview() from public;
revoke all on function public.get_entitlement() from public;
grant execute on function public.start_pro_preview() to authenticated;
grant execute on function public.get_entitlement() to authenticated;


-- ---------------------------------------------------------------------------
-- The unlock code.
--
-- A private way to hand somebody a lifetime unlock without a payment: they type
-- the code into the body-weight field and the entry is swallowed rather than
-- saved. It is the owner giving away their own product, which is theirs to give.
--
-- The comparison happens HERE and not in the app, and that is the whole point.
-- A constant in the client ships inside the bundle and inside the APK, where it
-- survives minification and takes about a minute to find. A function body in
-- `public` is never served by PostgREST, so the code itself is not in anything
-- a user can download. What they can see is that *a* code exists — the request
-- is visible in network traces — so this is private, not secret.
--
-- Four digits is a 10,000-key space, which is why the attempts are counted. A
-- dozen tries an hour turns a brute force into a month-long project per account,
-- and a legitimate weigh-in never comes close to the limit.

create table if not exists public.gym_unlock_attempts (
  user_id      uuid primary key references auth.users on delete cascade,
  window_start timestamptz not null default date_trunc('hour', now()),
  attempts     integer     not null default 0,
  -- Kept so a comped account can be told apart from a paying one later, which
  -- `gym_entitlements` on its own cannot show.
  redeemed_at  timestamptz
);

alter table public.gym_unlock_attempts enable row level security;
-- No policies at all: this table is for the definer function and for you, in the
-- SQL editor. The app never reads it.

create or replace function public.redeem_unlock(code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  tries integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  insert into public.gym_unlock_attempts (user_id, window_start, attempts)
  values (auth.uid(), date_trunc('hour', now()), 1)
  on conflict (user_id) do update
     -- Unqualified on purpose: inside ON CONFLICT DO UPDATE the existing row is
     -- addressed by the bare table name, and a schema-qualified reference is a
     -- syntax error rather than a stricter spelling of the same thing.
     set attempts = case
           when gym_unlock_attempts.window_start = date_trunc('hour', now())
           then gym_unlock_attempts.attempts + 1
           else 1 end,
         window_start = date_trunc('hour', now())
  returning attempts into tries;

  -- Over the limit the answer is a plain "no", indistinguishable from a wrong
  -- code. Saying "too many attempts" would confirm to a guesser that they had
  -- found something worth guessing at.
  if tries > 12 then
    return false;
  end if;

  if code is distinct from '2505' then
    return false;
  end if;

  insert into public.gym_entitlements (
    user_id, subscription_status, subscription_expires_at, entitlement_source)
  values (auth.uid(), 'active', null, 'subscription')
  on conflict (user_id) do update
     set subscription_status     = 'active',
         subscription_expires_at = null,
         entitlement_source      = 'subscription',
         updated_at              = now();

  update public.gym_unlock_attempts
     set redeemed_at = coalesce(redeemed_at, now())
   where user_id = auth.uid();

  return true;
end;
$$;

revoke all on function public.redeem_unlock(text) from public;
grant execute on function public.redeem_unlock(text) to authenticated;


-- ---------------------------------------------------------------------------
-- Cancelled is not expired.
--
-- Someone who turns off renewal has paid for the period they are in and keeps
-- Pro until it ends; taking it away the moment they cancel would be charging
-- for time and then not giving it. Store webhooks write this status, and
-- `subscription_expires_at` is what the app reads to know when it really ends.
--
-- Dropped and re-added rather than altered, because a check constraint cannot
-- be widened in place. Safe on a project that has never had the old one.

alter table public.gym_entitlements
  drop constraint if exists gym_entitlements_status;

alter table public.gym_entitlements
  add constraint gym_entitlements_status
  check (subscription_status in ('none', 'active', 'cancelled', 'expired'));
