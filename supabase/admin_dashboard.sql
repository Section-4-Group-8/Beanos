-- Admin-only aggregate metrics for the Beanos presentation dashboard.
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
      'status', 'needs_tracking',
      'message', 'The app does not yet record user ratings on repeated attempts.'
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
