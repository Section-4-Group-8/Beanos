-- Per-assignment lesson task history powers OKR 1.
create table if not exists public.lesson_task_assignments (
  assignment_id uuid not null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id bigint not null references public.lesson_task_recommendations(lesson_id) on delete restrict,
  task_id bigint not null references public.task_bank(id) on delete restrict,
  assigned_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  primary key (assignment_id, task_id)
);
create index if not exists lesson_task_assignments_user_time_idx
  on public.lesson_task_assignments (auth_user_id, assigned_at desc);
create index if not exists lesson_task_assignments_lesson_idx
  on public.lesson_task_assignments (lesson_id);
create index if not exists lesson_task_assignments_task_idx
  on public.lesson_task_assignments (task_id);
create index if not exists lesson_task_assignments_completion_idx
  on public.lesson_task_assignments (completed_at) where completed_at is not null;
alter table public.lesson_task_assignments enable row level security;
revoke all on public.lesson_task_assignments from public, anon;
grant select on public.lesson_task_assignments to authenticated;
drop policy if exists "Users read own lesson task assignments" on public.lesson_task_assignments;
create policy "Users read own lesson task assignments" on public.lesson_task_assignments
  for select to authenticated using ((select auth.uid()) = auth_user_id);

create or replace function public.beanos_assign_lesson_tasks(p_lesson_id bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  new_assignment_id uuid := pg_catalog.gen_random_uuid();
  inserted_count bigint;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  insert into public.lesson_task_assignments (assignment_id, auth_user_id, lesson_id, task_id)
  select new_assignment_id, actor, p_lesson_id, recommended.task_id
  from public.lesson_task_recommendations recommendation
  cross join lateral unnest(recommendation.task_ids) as recommended(task_id)
  join public.task_bank task on task.id = recommended.task_id
  where recommendation.lesson_id = p_lesson_id;
  get diagnostics inserted_count = row_count;
  if inserted_count <> 10 then
    raise exception 'LESSON_TASK_RECOMMENDATIONS_INCOMPLETE' using errcode = '23514';
  end if;
  return new_assignment_id;
end;
$$;

create or replace function public.beanos_complete_assigned_lesson_task(
  p_assignment_id uuid,
  p_task_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  matched_task_id bigint;
  matched_title text;
  matched_difficulty smallint;
  completion_time timestamptz := statement_timestamp();
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  update public.lesson_task_assignments assignment
  set completed_at = coalesce(assignment.completed_at, completion_time)
  where assignment.assignment_id = p_assignment_id
    and assignment.task_id = p_task_id
    and assignment.auth_user_id = actor
  returning assignment.task_id into matched_task_id;
  if matched_task_id is null then return false; end if;
  select task.title, task.difficulty into matched_title, matched_difficulty
  from public.task_bank task where task.id = matched_task_id;
  insert into public.task_completions (
    auth_user_id, task_id, task_title, difficulty, completed, completed_at
  ) values (
    actor, matched_task_id::text, matched_title, matched_difficulty, true, completion_time
  )
  on conflict (auth_user_id, task_id) do update
    set task_title = excluded.task_title,
        difficulty = excluded.difficulty,
        completed = true,
        completed_at = excluded.completed_at;
  return true;
end;
$$;
revoke all on function public.beanos_assign_lesson_tasks(bigint) from public, anon;
grant execute on function public.beanos_assign_lesson_tasks(bigint) to authenticated;
revoke all on function public.beanos_complete_assigned_lesson_task(uuid, bigint) from public, anon;
grant execute on function public.beanos_complete_assigned_lesson_task(uuid, bigint) to authenticated;

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
  assigned_task_count bigint;
  completed_assigned_task_count bigint;
  assigned_task_users bigint;
  assigned_task_completion_rate numeric;
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
  select count(*), count(*) filter (where a.completed_at is not null), count(distinct a.auth_user_id)
    into assigned_task_count, completed_assigned_task_count, assigned_task_users
  from public.lesson_task_assignments a;
  assigned_task_completion_rate := case when assigned_task_count > 0
    then round(completed_assigned_task_count::numeric * 100 / assigned_task_count, 1)
    else null end;
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
      'status', case when assigned_task_count > 0 then 'tracking' else 'waiting_for_assignments' end,
      'assigned_tasks', assigned_task_count,
      'completed_assigned_tasks', completed_assigned_task_count,
      'users_assigned_tasks', assigned_task_users,
      'completion_rate', assigned_task_completion_rate
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
