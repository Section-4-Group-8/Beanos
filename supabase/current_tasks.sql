-- Run once in the Supabase SQL Editor to persist each user's active task IDs.
alter table public."USER"
  add column if not exists current_tasks jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public."USER"'::regclass
      and conname = 'USER_current_tasks_is_array'
  ) then
    alter table public."USER"
      add constraint "USER_current_tasks_is_array"
      check (jsonb_typeof(current_tasks) = 'array');
  end if;
end;
$$;

create or replace function public.beanos_get_current_tasks()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  select coalesce(u.current_tasks, '[]'::jsonb) into result
  from public."USER" u
  where u.auth_user_id = auth.uid();
  if not found then raise exception 'Please log in to continue.' using errcode = '28000'; end if;
  return result;
end;
$$;

create or replace function public.beanos_add_current_tasks(p_task_ids bigint[])
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  update public."USER" u
  set current_tasks = (
    select coalesce(jsonb_agg(to_jsonb(task_id) order by first_seen), '[]'::jsonb)
    from (
      select value as task_id, min(position) as first_seen
      from jsonb_array_elements_text(u.current_tasks || coalesce(
        (select jsonb_agg(to_jsonb(id::text) order by position)
         from unnest(coalesce(p_task_ids, '{}'::bigint[])) with ordinality as input(id, position)),
        '[]'::jsonb
      )) with ordinality as existing(value, position)
      where value ~ '^[0-9]+$'
      group by value
    ) deduplicated
  ), updated_at = now()
  where u.auth_user_id = auth.uid()
  returning u.current_tasks into result;
  if not found then raise exception 'Please log in to continue.' using errcode = '28000'; end if;
  return result;
end;
$$;

create or replace function public.beanos_remove_current_task(p_task_id bigint)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  update public."USER" u
  set current_tasks = coalesce((
    select jsonb_agg(value order by position)
    from jsonb_array_elements(u.current_tasks) with ordinality as item(value, position)
    where value #>> '{}' <> p_task_id::text
  ), '[]'::jsonb), updated_at = now()
  where u.auth_user_id = auth.uid()
  returning u.current_tasks into result;
  if not found then raise exception 'Please log in to continue.' using errcode = '28000'; end if;
  return result;
end;
$$;

revoke all on function public.beanos_get_current_tasks(),
  public.beanos_add_current_tasks(bigint[]), public.beanos_remove_current_task(bigint)
  from public, anon;
grant execute on function public.beanos_get_current_tasks(),
  public.beanos_add_current_tasks(bigint[]), public.beanos_remove_current_task(bigint)
  to authenticated;
