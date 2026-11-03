-- Beanos: one current survey response per Supabase Auth user.
-- Run this entire file once in the Supabase SQL Editor as the project owner.
-- If survey_responses already exists, this transaction stops without replacing it.
-- Prerequisite for app access: sign in with Supabase Auth (not just SIGN_IN).

begin;

create table public.survey_responses (
  user_id uuid primary key default auth.uid()
    references auth.users (id) on delete cascade,
  answers jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint survey_responses_answers_object
    check (jsonb_typeof(answers) = 'object')
);

comment on table public.survey_responses is
  'One current survey answer object per Supabase Auth user; retakes update the same row.';
comment on column public.survey_responses.answers is
  'The object from BeanosSurvey.getAnswers(): schemaVersion, background, skills, mainGoal, lessonPriorities, completedAt.';

-- Set timestamps in the database; client values cannot override them.
create function public.set_survey_responses_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    NEW.created_at := statement_timestamp();
  else
    NEW.created_at := OLD.created_at;
  end if;
  NEW.updated_at := statement_timestamp();
  return NEW;
end;
$$;

revoke all on function public.set_survey_responses_timestamps() from public;

create trigger survey_responses_set_timestamps
before insert or update on public.survey_responses
for each row execute function public.set_survey_responses_timestamps();

alter table public.survey_responses enable row level security;

-- Remove inherited/default client grants, then allow only the required operations.
-- No anonymous access, and no client-side deletion of saved responses.
revoke all on table public.survey_responses from public, anon, authenticated;
grant select, insert, update on table public.survey_responses to authenticated;

create policy survey_responses_select_own
on public.survey_responses
for select to authenticated
using ((select auth.uid()) = user_id);

create policy survey_responses_insert_own
on public.survey_responses
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy survey_responses_update_own
on public.survey_responses
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

commit;
