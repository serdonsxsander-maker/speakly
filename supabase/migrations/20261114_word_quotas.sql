-- =========================================================================
-- Speakly Word Quotas & Plan Usage Migration
-- Tracks Free (3,000 words/mo) vs Pro (Unlimited) tiers and usage periods
-- =========================================================================

-- 1. Create user_usage table
create table if not exists public.user_usage (
  user_id                     uuid primary key references auth.users (id) on delete cascade,
  plan                        text not null default 'free' check (plan in ('free', 'pro')),
  words_used                  integer not null default 0 check (words_used >= 0),
  period_start                timestamptz not null default now(),
  period_end                  timestamptz not null default (now() + interval '30 days'),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.user_usage is 'Tracks monthly dictation word counts and quota periods for Speakly users.';

-- Indexes
create index if not exists user_usage_plan_idx on public.user_usage (plan);
create index if not exists user_usage_period_end_idx on public.user_usage (period_end);

-- 2. Row Level Security
alter table public.user_usage enable row level security;
revoke all on table public.user_usage from anon;
grant select on table public.user_usage to authenticated;
grant all on table public.user_usage to service_role;

drop policy if exists "Users can view own usage" on public.user_usage;
create policy "Users can view own usage"
  on public.user_usage
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- 3. Automatic row creation for new users
create or replace function public.handle_new_user_usage()
returns trigger as $$
begin
  insert into public.user_usage (user_id, plan, words_used, period_start, period_end)
  values (new.id, 'free', 0, now(), now() + interval '30 days')
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created_usage on auth.users;
create trigger on_auth_user_created_usage
  after insert on auth.users
  for each row execute function public.handle_new_user_usage();

-- 4. Backfill any existing users who don't have a user_usage row
insert into public.user_usage (user_id, plan, words_used, period_start, period_end)
select 
  u.id,
  case 
    when exists (
      select 1 from public.subscriptions s 
      where s.user_id = u.id and s.status in ('active', 'on_trial')
    ) then 'pro'
    else 'free'
  end as plan,
  0 as words_used,
  now() as period_start,
  now() + interval '30 days' as period_end
from auth.users u
on conflict (user_id) do update
set plan = excluded.plan;

-- 5. Atomic helper function for quota checking and incrementing
create or replace function public.record_word_usage(
  p_user_id uuid,
  p_words integer
)
returns table (
  plan text,
  words_used integer,
  period_start timestamptz,
  period_end timestamptz,
  allowed boolean
) as $$
declare
  v_rec public.user_usage%rowtype;
begin
  -- Fetch current record with row lock
  select * into v_rec from public.user_usage where user_id = p_user_id for update;

  -- If no record exists, initialize one
  if not found then
    insert into public.user_usage (user_id, plan, words_used, period_start, period_end)
    values (p_user_id, 'free', 0, now(), now() + interval '30 days')
    returning * into v_rec;
  end if;

  -- Check if 30-day period has expired; if so, reset period and counter
  if now() > v_rec.period_end then
    update public.user_usage uu
    set words_used = 0,
        period_start = now(),
        period_end = now() + interval '30 days',
        updated_at = now()
    where uu.user_id = p_user_id
    returning * into v_rec;
  end if;

  -- Synchronize plan with subscriptions table if active pro sub exists
  if v_rec.plan <> 'pro' and exists (
    select 1 from public.subscriptions s 
    where s.user_id = p_user_id and s.status in ('active', 'on_trial')
  ) then
    update public.user_usage uu
    set plan = 'pro',
        updated_at = now()
    where uu.user_id = p_user_id
    returning * into v_rec;
  end if;

  -- Check if increment allowed
  if v_rec.plan = 'free' and v_rec.words_used >= 3000 then
    return query select v_rec.plan, v_rec.words_used, v_rec.period_start, v_rec.period_end, false;
    return;
  end if;

  -- Apply word increment if words > 0
  if p_words > 0 then
    update public.user_usage uu
    set words_used = uu.words_used + p_words,
        updated_at = now()
    where uu.user_id = p_user_id
    returning * into v_rec;
  end if;

  return query select v_rec.plan, v_rec.words_used, v_rec.period_start, v_rec.period_end, true;
end;
$$ language plpgsql security definer;

-- Grant execution to authenticated & service_role
grant execute on function public.record_word_usage(uuid, integer) to service_role;
