-- Apply after connect_survey_auth.sql and before publishing the updated survey.
-- Omitted skills represent skipped actions. Existing six-action responses remain valid.
begin;

create or replace function public.beanos_valid_survey(a jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare all_skills jsonb; begin
  if a is null or jsonb_typeof(a) <> 'object' or octet_length(a::text) > 20000
    or a->'schemaVersion' is distinct from '1'::jsonb
    or jsonb_typeof(a->'background') is distinct from 'object'
    or jsonb_typeof(a->'skills') is distinct from 'object'
    or jsonb_typeof(a#>'{skills,strengths}') is distinct from 'array'
    or jsonb_typeof(a#>'{skills,practice}') is distinct from 'array'
    or jsonb_typeof(a->'lessonPriorities') is distinct from 'array'
    or jsonb_typeof(a->'completedAt') is distinct from 'string'
  then return false; end if;
  if not coalesce(
    a#>>'{background,experience}' = any(array['no-dates','dates-no-relationship','relationship-experience','prefer-not-to-answer'])
    and a#>>'{background,conversationStyle}' = any(array['start','wait','keep-to-myself','depends'])
    and a#>>'{background,comfort}' = any(array['very-uncomfortable','somewhat-uncomfortable','neutral','somewhat-comfortable','very-comfortable','unsure'])
    and a->>'mainGoal' = any(array['conversation-confidence','ask-on-date','comfortable-first-dates','connection-beyond-first-date','find-girlfriend','return-to-dating','find-starting-point']), false)
  then return false; end if;
  all_skills := (a#>'{skills,strengths}') || (a#>'{skills,practice}');
  if jsonb_array_length(all_skills) > 12
    or (select count(distinct value) from jsonb_array_elements_text(all_skills)) <> jsonb_array_length(all_skills)
    or exists(select 1 from jsonb_array_elements_text(all_skills) as s(value) where not coalesce(value = any(array['start-conversation','keep-conversation','follow-up-questions','share-about-myself','express-interest','ask-on-date','plan-date','comfortable-on-date','follow-up-after-date','handle-rejection','communicate-boundaries','check-mutual-interest']), false))
    or jsonb_array_length(a->'lessonPriorities') <> 6
    or (select count(distinct value) from jsonb_array_elements_text(a->'lessonPriorities')) <> 6
    or exists(select 1 from jsonb_array_elements_text(a->'lessonPriorities') as l(value) where not coalesce(value = any(array['confidence','conversations','interest-and-boundaries','asking-someone-out','date-planning','following-up']), false))
  then return false; end if;
  return isfinite((a->>'completedAt')::timestamptz);
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;

commit;
