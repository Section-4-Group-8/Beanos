-- Aggregate task completions by Auth user. The invoker-security view respects
-- task_completions RLS for app users while allowing project admins to inspect
-- the per-user totals in Supabase Studio.
create or replace view public.task_completion_counts
with (security_invoker = true)
as
select
  auth_user_id,
  count(*)::bigint as completed_task_count
from public.task_completions
where completed
group by auth_user_id;

revoke all on public.task_completion_counts from public, anon;
grant select on public.task_completion_counts to authenticated;
