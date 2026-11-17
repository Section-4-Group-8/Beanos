-- Admin-only aggregate metrics for the Beanos presentation dashboard.
-- Append-only rating history enables same-task comparisons across attempts.
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
create policy "Users read own task rating attempts" on public.task_rating_attempts
  for select to authenticated using ((select auth.uid()) = auth_user_id);
drop policy if exists "Users insert own task rating attempts" on public.task_rating_attempts;
create policy "Users insert own task rating attempts" on public.task_rating_attempts
  for insert to authenticated with check ((select auth.uid()) = auth_user_id);

-- Add a trusted administrator's Auth UUID to admin_users as the project owner.
create table if not exists public.admin_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default statement_timestamp()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from public, anon, authenticated;
grant select on public.admin_users to authenticated;
drop policy if exists "Admins can view own allowlist entry" on public.admin_users;
create policy "Admins can view own allowlist entry" on public.admin_users
  for select to authenticated
  using ((select auth.uid()) = auth_user_id);

create or replace function public.beanos_admin_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  plan_date_task_count bigint;
  plan_date_task_users bigint;
  go_on_date_task_count bigint;
  go_on_date_task_users bigint;
  plan_date_task_exists boolean;
  go_on_date_exists boolean;
  girlfriend_task_exists boolean;
  girlfriend_task_count bigint;
  rating_attempt_count bigint;
  repeat_rating_count bigint;
  average_rating_change numeric;
  rating_trend jsonb;
begin
  if actor is null or not exists (
    select 1 from public.admin_users a where a.auth_user_id = actor
  ) then
    raise exception 'ADMIN_ACCESS_REQUIRED' using errcode = '42501';
  end if;

  select count(*), count(distinct c.auth_user_id)
    into plan_date_task_count, plan_date_task_users
  from public.task_completions c
  where c.completed
    and c.task_id in (
      select t.id::text from public.task_bank t
      where (lower(t.title) like '%date%plan%')
         or (lower(t.title) like '%plan%date%')
    );

  select exists (
    select 1 from public.task_bank t
    where lower(t.title) like '%date%plan%'
       or lower(t.title) like '%plan%date%'
  ) into plan_date_task_exists;

  select count(*), count(distinct c.auth_user_id)
    into go_on_date_task_count, go_on_date_task_users
  from public.task_completions c
  where c.completed
    and c.task_id in (
      select t.id::text from public.task_bank t
      where lower(t.title) like '%go on a date%'
    );

  select exists (
    select 1 from public.task_bank t
    where lower(t.title) like '%go on a date%'
  ) into go_on_date_exists;

  select exists (
    select 1 from public.task_bank t
    where lower(t.title) like '%girlfriend%'
  ) into girlfriend_task_exists;

  select count(*) into girlfriend_task_count
  from public.task_completions c
  where c.completed and lower(c.task_title) like '%girlfriend%';

  select count(*) into rating_attempt_count from public.task_rating_attempts;
  with ordered_ratings as (
    select rated_at, rating,
      lag(rating) over (partition by auth_user_id, task_id order by rated_at, id) as previous_rating
    from public.task_rating_attempts
  )
  select count(*) filter (where previous_rating is not null),
         round(avg(rating - previous_rating)::numeric, 2)
    into repeat_rating_count, average_rating_change
  from ordered_ratings;

  with ordered_ratings as (
    select rated_at, rating,
      lag(rating) over (partition by auth_user_id, task_id order by rated_at, id) as previous_rating
    from public.task_rating_attempts
  ), weekly_changes as (
    select date_trunc('week', rated_at)::date as week_start,
      count(*) as repeat_attempts,
      round(avg(rating - previous_rating)::numeric, 2) as average_change
    from ordered_ratings where previous_rating is not null
    group by date_trunc('week', rated_at)::date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'week_start', week_start, 'repeat_attempts', repeat_attempts, 'average_change', average_change
    ) order by week_start), '[]'::jsonb)
    into rating_trend from weekly_changes;

  return jsonb_build_object(
    'overview', jsonb_build_object(
      'total_users', (select count(*) from public."USER"),
      'survey_completed_users', (select count(*) from public.survey_responses),
      'completed_task_records', (select count(*) from public.task_completions where completed),
      'users_with_completed_tasks', (select count(distinct auth_user_id) from public.task_completions where completed)
    ),
    'okr1', jsonb_build_object(
      'status', 'needs_tracking',
      'message', 'User-specific task assignments are not recorded yet.'
    ),
    'okr2', jsonb_build_object(
      'status', case when repeat_rating_count > 0 then 'tracking'
        when rating_attempt_count > 0 then 'waiting_for_repeats' else 'waiting_for_ratings' end,
      'rated_attempts', rating_attempt_count,
      'repeat_attempts', repeat_rating_count,
      'average_rating_change', average_rating_change,
      'rating_trend', rating_trend
    ),
    'okr3', jsonb_build_object(
      'status', case when go_on_date_exists then 'partial' else 'needs_task' end,
      'plan_date_task_completions', plan_date_task_count,
      'users_with_plan_date_completion', plan_date_task_users,
      'plan_date_task_available', plan_date_task_exists,
      'go_on_date_task_completions', go_on_date_task_count,
      'users_with_go_on_date_completion', go_on_date_task_users,
      'go_on_date_task_available', go_on_date_exists
    ),
    'okr4', jsonb_build_object(
      'status', case when girlfriend_task_exists then 'tracking' else 'needs_task' end,
      'girlfriend_task_available', girlfriend_task_exists,
      'completed_task_records', girlfriend_task_count,
      'users_completed', (select count(distinct auth_user_id) from public.task_completions where completed and lower(task_title) like '%girlfriend%')
    )
  );
end;
$$;

revoke all on function public.beanos_admin_dashboard_metrics() from public, anon, authenticated;
grant execute on function public.beanos_admin_dashboard_metrics() to authenticated;
