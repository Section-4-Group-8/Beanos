-- Run once for the original, EMPTY UUID-based survey_responses table.
-- Existing responses require a deliberate UUID-to-USER mapping; this script refuses
-- to convert a populated table rather than discarding or guessing user ownership.
begin;

lock table public.survey_responses in access exclusive mode;

do $$
begin
  if exists (select 1 from public.survey_responses) then
    raise exception 'Survey responses exist. Supply an explicit UUID-to-USER.user_id mapping before migration.';
  end if;
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'survey_responses'
        and column_name = 'user_id') is distinct from 'uuid' then
    raise exception 'Expected the original UUID user_id. Check the current schema before migration.';
  end if;
end;
$$;

revoke all on table public.survey_responses from public, anon, authenticated;

drop policy survey_responses_select_own on public.survey_responses;
drop policy survey_responses_insert_own on public.survey_responses;
drop policy survey_responses_update_own on public.survey_responses;

alter table public.survey_responses
  alter column user_id drop default,
  drop constraint survey_responses_user_id_fkey;

-- The table is locked and verified empty above; no IDs or answers are discarded.
alter table public.survey_responses
  alter column user_id type bigint using null::bigint;

alter table public.survey_responses
  add constraint survey_responses_user_id_fkey
  foreign key (user_id) references public."USER" (user_id) on delete cascade;

alter table public.survey_responses enable row level security;
grant select, insert, update on table public.survey_responses to service_role;

comment on table public.survey_responses is
  'One current survey response per public.USER.user_id (int8). A trusted backend must enforce user ownership; browser roles have no access.';

commit;
