-- Set the accepted lesson path on the current user's survey, preserving their answers.
begin;

create or replace function public.beanos_accept_lesson_order(p_order smallint[], p_survey_completed_at text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account jsonb;
  saved jsonb;
begin
  if p_order is null or array_ndims(p_order) is distinct from 1
    or cardinality(p_order) <> 6
    or not (p_order @> array[1, 2, 3, 4, 5, 6]::smallint[]) then
    raise exception 'A lesson order must include each of the six lessons once.' using errcode = '22023';
  end if;

  account := public.beanos_account();
  if (account->>'surveyCompleted') is distinct from 'true' then
    raise exception 'Complete your survey before changing your lesson order.' using errcode = 'PT409';
  end if;

  update public.survey_responses
  set answers = jsonb_set(answers, '{acceptedLessonOrder}', to_jsonb(p_order))
  where user_id = (account->>'userId')::bigint
    and answers->>'completedAt' = p_survey_completed_at
  returning answers into saved;

  if not found then
    raise exception 'Your survey changed. Request a new suggestion before saving.' using errcode = 'PT409';
  end if;
  return saved;
end;
$$;

revoke all on function public.beanos_accept_lesson_order(smallint[], text) from public, anon, authenticated;
grant execute on function public.beanos_accept_lesson_order(smallint[], text) to authenticated;
notify pgrst, 'reload schema';
commit;
