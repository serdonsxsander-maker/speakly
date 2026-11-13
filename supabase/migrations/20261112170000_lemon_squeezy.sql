-- =========================================================================
-- Speakly Lemon Squeezy Integration & Recurring Affiliate Attribution
-- Handles EU/Belgian VAT compliance, Subscriptions & 30% Partner Commissions
-- =========================================================================

-- 1. Subscriptions Table: Authoritative Subscription Record
create table if not exists public.subscriptions (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users (id) on delete cascade,
  lemon_squeezy_id            text unique,
  customer_id                 text,
  order_id                    text,
  status                      text not null default 'inactive' check (
                                status in ('active', 'on_trial', 'paused', 'past_due', 'unpaid', 'cancelled', 'expired', 'inactive')
                              ),
  plan                        text not null default 'pro',
  variant_id                  text,
  trial_ends_at               timestamptz,
  renews_at                   timestamptz,
  ends_at                     timestamptz,
  customer_portal_url         text,
  update_payment_method_url   text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.subscriptions is 'User subscription status synchronized via Lemon Squeezy webhooks.';

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_ls_id_idx on public.subscriptions (lemon_squeezy_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

-- Enable RLS: Users can only see their own subscription record
alter table public.subscriptions enable row level security;
revoke all on table public.subscriptions from anon;
grant select on table public.subscriptions to authenticated;

drop policy if exists "Users can view own subscription" on public.subscriptions;
create policy "Users can view own subscription"
  on public.subscriptions
  for select
  to authenticated
  using (user_id = (select auth.uid()));


-- 2. Partner Paid Conversions Table
-- Records every billable event (initial order or recurring monthly subscription renewal)
-- with exact 30% commission attribution to the partner code.
create table if not exists public.partner_conversions (
  id                          uuid primary key default gen_random_uuid(),
  created_at                  timestamptz not null default now(),
  partner_code                text not null,
  user_id                     uuid references auth.users (id) on delete set null,
  user_email                  text,
  lemon_squeezy_order_id      text,
  lemon_squeezy_subscription_id text,
  amount_cents                integer not null default 0,
  currency                    text not null default 'USD',
  commission_rate             numeric(4, 2) not null default 0.30,
  commission_cents            integer not null default 0,
  status                      text not null default 'paid' check (status in ('paid', 'refunded', 'pending'))
);

comment on table public.partner_conversions is 'Individual paid order and renewal commissions attributed to creator/partner referral codes.';

create index if not exists partner_conversions_code_idx on public.partner_conversions (partner_code);
create index if not exists partner_conversions_user_idx on public.partner_conversions (user_id);
create index if not exists partner_conversions_created_idx on public.partner_conversions (created_at desc);

-- RLS: Founder / Service-Role only
alter table public.partner_conversions enable row level security;
revoke all on table public.partner_conversions from anon, authenticated;


-- 3. Partner Revenue Summary View
-- Gives the founder an instant rollup of:
--  - Free Signups vs Paid Conversions
--  - Active paying subscriptions per partner
--  - Total Revenue generated
--  - Total 30% Recurring Commission accrued
create or replace view public.partner_revenue_summary as
with signups as (
  select
    upper(trim(raw_user_meta_data->>'referral_code')) as partner_code,
    count(*) as total_signups,
    min(created_at) as first_signup_at,
    max(created_at) as latest_signup_at
  from auth.users
  where raw_user_meta_data->>'referral_code' is not null
    and trim(raw_user_meta_data->>'referral_code') <> ''
  group by upper(trim(raw_user_meta_data->>'referral_code'))
),
conversions as (
  select
    upper(trim(partner_code)) as partner_code,
    count(*) as total_paid_invoices,
    count(distinct user_id) as paying_customers,
    coalesce(sum(amount_cents) filter (where status = 'paid'), 0) as total_gross_cents,
    coalesce(sum(commission_cents) filter (where status = 'paid'), 0) as total_commission_cents
  from public.partner_conversions
  group by upper(trim(partner_code))
),
active_subs as (
  select
    upper(trim(u.raw_user_meta_data->>'referral_code')) as partner_code,
    count(*) as active_paying_subs
  from public.subscriptions s
  join auth.users u on u.id = s.user_id
  where s.status in ('active', 'on_trial')
    and u.raw_user_meta_data->>'referral_code' is not null
    and trim(u.raw_user_meta_data->>'referral_code') <> ''
  group by upper(trim(u.raw_user_meta_data->>'referral_code'))
)
select
  s.partner_code,
  s.total_signups,
  coalesce(c.paying_customers, 0) as paying_customers,
  coalesce(a.active_paying_subs, 0) as active_subscriptions,
  round((coalesce(c.paying_customers, 0)::numeric / nullif(s.total_signups, 0) * 100), 1) as conversion_rate_pct,
  coalesce(c.total_gross_cents, 0) as total_revenue_cents,
  coalesce(c.total_commission_cents, 0) as total_commission_cents,
  s.first_signup_at,
  s.latest_signup_at
from signups s
left join conversions c on c.partner_code = s.partner_code
left join active_subs a on a.partner_code = s.partner_code
order by coalesce(c.total_gross_cents, 0) desc, s.total_signups desc;

comment on view public.partner_revenue_summary is 'Aggregated referral funnel metrics: signups, paid conversions, gross revenue, and 30% recurring partner commissions.';

revoke all on public.partner_revenue_summary from anon, authenticated;
