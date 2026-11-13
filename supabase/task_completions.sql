-- Run once in the Supabase SQL Editor to enable per-user task completion tracking.
create table if not exists public.task_completions (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  task_title text not null,
  difficulty smallint not null check (difficulty between 1 and 5),
  completed boolean not null default true,
  completed_at timestamptz,
  primary key (auth_user_id, task_id),
  check ((completed and completed_at is not null) or (not completed and completed_at is null))
);

alter table public.task_completions enable row level security;
revoke all on public.task_completions from public, anon;
grant select, insert, update on public.task_completions to authenticated;

drop policy if exists "Users read own task completions" on public.task_completions;
drop policy if exists "Users insert own task completions" on public.task_completions;
drop policy if exists "Users update own task completions" on public.task_completions;
create policy "Users read own task completions" on public.task_completions
  for select to authenticated using (auth.uid() = auth_user_id);
create policy "Users insert own task completions" on public.task_completions
  for insert to authenticated with check (auth.uid() = auth_user_id);
create policy "Users update own task completions" on public.task_completions
  for update to authenticated using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id);
