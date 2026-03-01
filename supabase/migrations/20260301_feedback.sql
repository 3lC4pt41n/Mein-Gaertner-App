-- Feedback table for beta testers
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  category   text not null check (category in ('bug', 'feature', 'other')),
  message    text not null,
  app_version text,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.feedback enable row level security;

-- Users can insert their own feedback
create policy "Users can insert own feedback"
  on public.feedback for insert
  with check (auth.uid() = user_id);

-- Users can read their own feedback
create policy "Users can read own feedback"
  on public.feedback for select
  using (auth.uid() = user_id);

-- Admins can read all feedback
create policy "Admins can read all feedback"
  on public.feedback for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );
