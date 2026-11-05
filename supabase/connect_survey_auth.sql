-- Run once, as the project owner, after reviewing the account/login cutover.
-- Keeps existing integer IDs and rows. Does not import or expose legacy passwords.
begin;

lock table public."USER", public."SIGN_IN", public.survey_responses in share row exclusive mode;

alter table public."USER" add column auth_user_id uuid unique
  references auth.users(id); -- RESTRICT deletion until account data is reviewed.
-- One-time cutover only: link already-confirmed Auth accounts when both legacy
-- account tables agree. Future registrations are NEVER linked by email alone.
-- Apply this before turning off email confirmation in the Auth settings.
update public."USER" u set auth_user_id=a.id
from auth.users a
where a.email_confirmed_at is not null and a.deleted_at is null
  and not coalesce(a.is_anonymous,false)
  and lower(trim(a.email))=lower(trim(u.email))
  and (select count(*) from public."USER" x where lower(trim(x.email))=lower(trim(a.email)))=1
  and (select count(*) from auth.users x where lower(trim(x.email))=lower(trim(a.email)))=1
  and not exists(select 1 from public."SIGN_IN" s
    where (s.user_id=u.user_id and lower(trim(s.email)) is distinct from lower(trim(a.email)))
      or (s.user_id<>u.user_id and lower(trim(s.email))=lower(trim(a.email))));
create sequence public.beanos_user_id_seq as bigint;
select setval('public.beanos_user_id_seq', greatest(
  coalesce((select max(user_id) from public."USER"), 0),
  coalesce((select max(user_id) from public."SIGN_IN"), 0), 1
), true);
alter sequence public.beanos_user_id_seq owned by public."USER".user_id;
alter table public."USER" alter column user_id set default nextval('public.beanos_user_id_seq');

-- Both the table grants and RLS stay closed. Only the narrowly scoped RPCs
-- below are callable by signed-in users. They never accept a user ID.
alter table public."USER" enable row level security;
alter table public."SIGN_IN" enable row level security;
alter table public.survey_responses enable row level security;
revoke all on public."USER", public."SIGN_IN", public.survey_responses from public, anon, authenticated;
revoke all on sequence public.beanos_user_id_seq, public."SIGN_IN_user_id_seq" from public, anon, authenticated;

do $$ declare p record; begin
  for p in select tablename, policyname from pg_policies
    where schemaname='public' and tablename in ('USER','SIGN_IN','survey_responses')
  loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
  -- Table-level REVOKE does not remove any separately granted column privileges.
  for p in select table_name,string_agg(quote_ident(column_name),',') as columns
    from information_schema.columns where table_schema='public'
      and table_name in ('USER','SIGN_IN','survey_responses') group by table_name
  loop execute format('revoke all (%s) on public.%I from public, anon, authenticated',p.columns,p.table_name); end loop;
end $$;

create function public.beanos_valid_survey(a jsonb)
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
  if jsonb_array_length(all_skills) <> 6
    or (select count(distinct value) from jsonb_array_elements_text(all_skills)) <> 6
    or exists(select 1 from jsonb_array_elements_text(all_skills) as s(value) where not coalesce(value = any(array['start-conversation','keep-conversation','follow-up-questions','share-about-myself','express-interest','ask-on-date','plan-date','comfortable-on-date','follow-up-after-date','handle-rejection','communicate-boundaries','check-mutual-interest']), false))
    or jsonb_array_length(a->'lessonPriorities') <> 6
    or (select count(distinct value) from jsonb_array_elements_text(a->'lessonPriorities')) <> 6
    or exists(select 1 from jsonb_array_elements_text(a->'lessonPriorities') as l(value) where not coalesce(value = any(array['confidence','conversations','interest-and-boundaries','asking-someone-out','date-planning','following-up']), false))
  then return false; end if;
  return isfinite((a->>'completedAt')::timestamptz);
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;

create function public.beanos_account()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); mail text; profile public."USER"%rowtype;
begin
  select lower(trim(u.email)) into mail from auth.users u
    where u.id=actor and u.deleted_at is null and not coalesce(u.is_anonymous,false)
      and (u.banned_until is null or u.banned_until < statement_timestamp());
  if actor is null or mail is null or mail='' then
    raise exception 'Please log in to continue.' using errcode='28000';
  end if;
  -- Serialize first-time profile creation and email updates across browser tabs.
  perform pg_advisory_xact_lock(714205831);
  select * into profile from public."USER" where auth_user_id=actor for update;
  if not found then
    -- Email equality alone is NOT identity proof, especially with confirmations off.
    -- An administrator must explicitly review/link legacy accounts.
    if exists(select 1 from public."USER" where lower(trim(email))=mail)
      or exists(select 1 from public."SIGN_IN" where lower(trim(email))=mail) then
      raise exception 'LEGACY_ACCOUNT_LINK_REQUIRED';
    end if;
    insert into public."USER"(auth_user_id,email,display_name,created_at,updated_at)
      values(actor,mail,null,statement_timestamp(),statement_timestamp()) returning * into profile;
  elsif lower(trim(profile.email)) is distinct from mail then
    if exists(select 1 from public."USER" where lower(trim(email))=mail and user_id<>profile.user_id)
      or exists(select 1 from public."SIGN_IN" where lower(trim(email))=mail and user_id<>profile.user_id) then
      raise exception 'ACCOUNT_EMAIL_CONFLICT';
    end if;
    update public."USER" set email=mail,updated_at=statement_timestamp()
      where user_id=profile.user_id returning * into profile;
  end if;
  return jsonb_build_object('userId',profile.user_id::text,'email',mail,
    'surveyCompleted',exists(select 1 from public.survey_responses s
      where s.user_id=profile.user_id and public.beanos_valid_survey(s.answers)));
end;
$$;

create function public.beanos_get_survey()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare account jsonb; result jsonb; begin
  account := public.beanos_account();
  select answers into result from public.survey_responses where user_id=(account->>'userId')::bigint;
  return result;
end;
$$;

create function public.beanos_save_survey(p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare account jsonb; saved jsonb; begin
  account := public.beanos_account();
  if not public.beanos_valid_survey(p_answers) then
    raise exception 'Please complete all survey questions before saving.' using errcode='22023';
  end if;
  -- Construct the allowed payload; extra fields and client timestamps are ignored.
  saved := jsonb_build_object('schemaVersion',1,'background',p_answers->'background',
    'skills',p_answers->'skills','mainGoal',p_answers->'mainGoal',
    'lessonPriorities',p_answers->'lessonPriorities','completedAt',statement_timestamp());
  insert into public.survey_responses(user_id,answers)
    values((account->>'userId')::bigint,saved)
    on conflict(user_id) do update set answers=excluded.answers;
  return saved;
end;
$$;

-- PostgreSQL grants PUBLIC execute by default; remove it explicitly.
revoke all on function public.beanos_valid_survey(jsonb),public.beanos_account(),
  public.beanos_get_survey(),public.beanos_save_survey(jsonb) from public,anon,authenticated;
grant execute on function public.beanos_account(),public.beanos_get_survey(),
  public.beanos_save_survey(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
