-- Speakly in-app feedback (bug reports / ideas from early-access users).
-- Users can only INSERT their own rows. There are intentionally no
-- SELECT / UPDATE / DELETE policies for users: the founder reviews
-- feedback via the Supabase dashboard (service role bypasses RLS).

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid references auth.users (id) on delete set null default auth.uid(),
  email       text,
  kind        text not null default 'other' check (kind in ('bug', 'idea', 'other')),
  message     text not null check (char_length(message) between 1 and 5000),
  app_version text,
  os          text,
  os_version  text,
  active_mode text,
  status      text not null default 'new'
);

comment on table public.feedback is 'In-app feedback from Speakly desktop users (insert-only for authenticated users).';

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_status_idx on public.feedback (status);

alter table public.feedback enable row level security;

-- Make sure only the intended privileges exist for API roles.
revoke all on table public.feedback from anon, authenticated;
-- Column-level grant: users cannot set id / created_at / status themselves.
grant insert (user_id, email, kind, message, app_version, os, os_version, active_mode)
  on table public.feedback to authenticated;

drop policy if exists "Users can submit their own feedback" on public.feedback;
create policy "Users can submit their own feedback"
  on public.feedback
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));
