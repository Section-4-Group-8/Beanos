-- Beanos: one current survey response per existing USER.user_id (int8).
-- Run this entire file once in the Supabase SQL Editor as the project owner.
-- If survey_responses already exists, this transaction stops without replacing it.
-- Browser roles are denied access. Use a trusted backend that verifies the custom login/session.

begin;

create table public.survey_responses (
  user_id bigint primary key
    references public."USER" (user_id) on delete cascade,
  answers jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint survey_responses_answers_object
    check (jsonb_typeof(answers) = 'object')
);

comment on table public.survey_responses is
  'One current survey response per public.USER.user_id (int8). A trusted backend must enforce user ownership; browser roles have no access.';
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

-- An int8 foreign key links data but does not identify the browser's user.
-- Keep all direct browser access closed until a verified identity mechanism exists.
-- The backend must derive user_id from its verified session, never from a client claim.
revoke all on table public.survey_responses from public, anon, authenticated;
grant select, insert, update on table public.survey_responses to service_role;

-- RLS stays enabled with no client policies. The server's service role bypasses
-- RLS, so per-user authorization must be enforced by the backend before each query.
-- Keep the service-role key on the server.

commit;
