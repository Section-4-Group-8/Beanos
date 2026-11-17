-- Run once after lesson_resources has at least one resource row for each lesson.
-- The roleplay JSON is stored on the first ordered resource row for each lesson;
-- it does not create extra rows that would appear in the lesson resource carousel.
-- Re-running this script refreshes only roleplay_config with these six scenarios.
begin;

alter table public.lesson_resources
  add column if not exists roleplay_config jsonb;

alter table public.lesson_resources
  drop constraint if exists lesson_resources_roleplay_config_shape;
alter table public.lesson_resources
  add constraint lesson_resources_roleplay_config_shape check (
    roleplay_config is null or (
      jsonb_typeof(roleplay_config) = 'object'
      and roleplay_config ?& array[
        'title', 'partner_name', 'setting', 'hook', 'partner_instructions',
        'learning_goal', 'opening_prompt', 'rubric'
      ]
      and jsonb_typeof(roleplay_config->'rubric') = 'array'
    )
  );

create unique index if not exists lesson_resources_one_roleplay_config_per_lesson
  on public.lesson_resources (lesson_id)
  where roleplay_config is not null;

do $$
begin
  if exists (
    select lesson_id
    from generate_series(1, 6) as lessons(lesson_id)
    where not exists (
      select 1 from public.lesson_resources r where r.lesson_id = lessons.lesson_id
    )
  ) then
    raise exception 'Add at least one lesson_resources row for each lesson (1–6), then rerun this script.';
  end if;
end;
$$;

with scenarios(lesson_id, roleplay_config) as (
  values
  (1, '{
    "title": "Starting with confidence",
    "partner_name": "Maya",
    "setting": "A neighborhood café line",
    "hook": "Maya is holding a well-worn novel and glances around casually while waiting to order. The learner is nearby and has a natural chance to start a brief conversation.",
    "partner_instructions": "Play Maya as a realistic stranger. Respond warmly but briefly to a respectful, relevant opener; if the learner is intrusive or intense, respond neutrally and let the interaction end. Do not coach during the roleplay.",
    "learning_goal": "Practice calming nerves and opening with a relaxed observation about the shared setting, without pressure or a personal comment about appearance.",
    "opening_prompt": "You are waiting in line at a café. Maya is holding a well-worn novel and glances around casually. Try a relaxed, context-based opener.",
    "rubric": ["Uses a natural observation about the shared context", "Sounds warm and clear", "Keeps the opener low-pressure and respects cues"]
  }'::jsonb),
  (2, '{
    "title": "Texting and keeping a conversation flowing",
    "partner_name": "Jordan",
    "setting": "A text conversation after a friendly introduction",
    "hook": "Jordan replies to the learner’s opening text with a short but friendly message about spending the weekend at a local food market. The learner can respond to that detail and keep the exchange relaxed.",
    "partner_instructions": "Play Jordan in a realistic text exchange. Keep messages concise and vary response length naturally. Respond to relevant details; do not carry the conversation or reward rapid-fire messages. Do not coach during the roleplay.",
    "learning_goal": "Practice matching the pace and tone of a text conversation, responding to details, and keeping the exchange engaging without sending a string of questions.",
    "opening_prompt": "Jordan texted: ‘I checked out the food market downtown this weekend. The dumpling stand was great.’ Reply in a relaxed way and see if you can keep the conversation flowing.",
    "rubric": ["Matches the casual tone and pace", "Responds to a specific detail in Jordan’s text", "Keeps the exchange balanced without overwhelming Jordan"]
  }'::jsonb),
  (3, '{
    "title": "Handling rejection with self-respect",
    "partner_name": "Alex",
    "setting": "A friendly conversation after a community event",
    "hook": "The learner and Alex have had a friendly conversation. The learner expresses interest in meeting again, and Alex kindly says they are not interested in dating. The learner gets a chance to respond.",
    "partner_instructions": "Play Alex as kind but clear. Do not soften or reverse the no if the learner argues, asks repeatedly, or tries to persuade. If the learner accepts it respectfully, acknowledge that briefly. Do not coach during the roleplay.",
    "learning_goal": "Practice hearing a no without treating it as a verdict on personal worth, accepting the other person’s choice, and ending the interaction respectfully.",
    "opening_prompt": "You had a friendly conversation with Alex after an event. You express interest in meeting again, and Alex replies: ‘Thanks for asking, but I’m not interested in dating.’ How would you respond?",
    "rubric": ["Accepts the answer without trying to change it", "Responds calmly and respectfully", "Separates the rejection from personal worth"]
  }'::jsonb),
  (4, '{
    "title": "Building confidence in personal style",
    "partner_name": "Sam",
    "setting": "Getting ready for a casual social event",
    "hook": "Sam is a trusted friend helping the learner choose what to wear for a casual social event. The learner is deciding between an outfit that feels authentic and one chosen mainly to impress other people.",
    "partner_instructions": "Play Sam as supportive and practical. Ask what feels comfortable and authentic, and discuss simple grooming or fit choices without shaming the learner or prescribing one ideal look. Do not coach outside the roleplay.",
    "learning_goal": "Practice making thoughtful style and grooming choices that help the learner feel comfortable and confident, rather than chasing approval.",
    "opening_prompt": "You are getting ready for a casual event. Sam asks what you’re thinking of wearing and whether you feel comfortable in it. Talk through your choice together.",
    "rubric": ["Explains personal preferences clearly", "Considers fit, grooming, and the event context", "Makes a confident choice without putting down their appearance"]
  }'::jsonb),
  (5, '{
    "title": "Making a clear invitation and choosing a date plan",
    "partner_name": "Riley",
    "setting": "A friendly conversation after a campus event in Provo",
    "hook": "The learner and Riley have been talking easily after a campus event. The learner would like to ask Riley out and can suggest a local activity, while leaving Riley free to accept, decline, or suggest something else.",
    "partner_instructions": "Play Riley realistically. Respond to a clear and considerate invitation with a yes, no, or alternative; do not guarantee a yes. If the learner is vague, give them a chance to clarify. Respect the learner’s response to your answer. Do not coach during the roleplay.",
    "learning_goal": "Practice framing a clear invitation and suggesting a thoughtful, specific activity that can be discussed together.",
    "opening_prompt": "You’ve enjoyed talking with Riley after a campus event in Provo. Ask Riley out and suggest a date idea, keeping the invitation easy to accept or decline.",
    "rubric": ["Makes the invitation direct and understandable", "Suggests a specific, considerate activity", "Leaves room for Riley’s choice and responds respectfully"]
  }'::jsonb),
  (6, '{
    "title": "Connecting on a first date",
    "partner_name": "Casey",
    "setting": "A first date at a quiet café",
    "hook": "The learner and Casey are on a first date. Casey mentions a hobby they care about and shares a short personal story. The date is friendly, and the learner can practice sharing a story and checking comfort rather than assuming physical closeness is welcome.",
    "partner_instructions": "Play Casey as open to conversation. Respond to thoughtful listening and relevant self-disclosure. If the learner moves toward physical contact, make comfort and consent clear; never imply that touch is owed or required. Do not coach during the roleplay.",
    "learning_goal": "Practice storytelling and attentive conversation on a date, while treating physical touch as mutual and checking comfort rather than assuming consent.",
    "opening_prompt": "You’re on a first date with Casey. Casey says, ‘I got into hiking after a friend took me on a trail last year,’ and starts telling the story. Respond naturally and share a little about yourself too.",
    "rubric": ["Listens and responds to Casey’s story", "Shares a relevant personal story without dominating", "Treats physical closeness as mutual and checks comfort"]
  }'::jsonb)
)
update public.lesson_resources as target
set roleplay_config = scenarios.roleplay_config
from scenarios
where target.id = (
  select source.id
  from public.lesson_resources as source
  where source.lesson_id = scenarios.lesson_id
  order by source.sort_order nulls last, source.id
  limit 1
);

commit;
