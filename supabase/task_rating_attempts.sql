-- Append-only task rating history for measuring changes across repeat attempts.
create table if not exists public.task_rating_attempts (
  id bigint generated always as identity primary key,
  attempt_id uuid not null unique,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  task_id bigint not null references public.task_bank(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  rated_at timestamptz not null default statement_timestamp()
);

create index if not exists task_rating_attempts_user_task_time_idx
  on public.task_rating_attempts (auth_user_id, task_id, rated_at, id);

alter table public.task_rating_attempts enable row level security;
revoke all on public.task_rating_attempts from public, anon;
grant select, insert on public.task_rating_attempts to authenticated;

drop policy if exists "Users read own task rating attempts" on public.task_rating_attempts;
create policy "Users read own task rating attempts"
  on public.task_rating_attempts for select to authenticated
  using ((select auth.uid()) = auth_user_id);

drop policy if exists "Users insert own task rating attempts" on public.task_rating_attempts;
create policy "Users insert own task rating attempts"
  on public.task_rating_attempts for insert to authenticated
  with check ((select auth.uid()) = auth_user_id);
