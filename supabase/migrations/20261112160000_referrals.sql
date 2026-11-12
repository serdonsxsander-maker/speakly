-- Speakly Partner & Creator Referral Tracking
-- Automatically extracts partner codes stored in auth.users.raw_user_meta_data->>'referral_code'
-- Gives the founder an instant view of all signups per creator without third-party affiliate software.

create or replace view public.partner_referrals as
select
  id as user_id,
  email,
  created_at,
  upper(trim(raw_user_meta_data->>'referral_code')) as referral_code,
  raw_user_meta_data->'speakly_prefs'->>'activeModeId' as initial_mode
from auth.users
where raw_user_meta_data->>'referral_code' is not null
  and trim(raw_user_meta_data->>'referral_code') <> '';

comment on view public.partner_referrals is 'List of all users who signed up using a creator or partner referral code.';

-- Summary View: Total signups grouped by partner code
create or replace view public.partner_performance_summary as
select
  upper(trim(raw_user_meta_data->>'referral_code')) as partner_code,
  count(*) as total_signups,
  min(created_at) as first_referral_at,
  max(created_at) as latest_referral_at
from auth.users
where raw_user_meta_data->>'referral_code' is not null
  and trim(raw_user_meta_data->>'referral_code') <> ''
group by upper(trim(raw_user_meta_data->>'referral_code'))
order by total_signups desc;

comment on view public.partner_performance_summary is 'Aggregated performance metrics per partner code.';

-- SECURITY: Strictly lock views so only the founder (Dashboard / service_role) can view referrals
revoke all on public.partner_referrals from anon, authenticated;
revoke all on public.partner_performance_summary from anon, authenticated;

