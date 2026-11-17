-- Run once after lesson_resources has at least one resource row for each lesson.
-- The roleplay JSON is stored on the first ordered resource row for each lesson;
-- it does not create extra rows that would appear in the lesson resource carousel.
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
    "title": "Starting and continuing conversations",
    "partner_name": "Jordan",
    "setting": "A community talk before it begins",
    "hook": "Jordan is standing near the refreshments before a local talk. The learner has just arrived; there is a shared topic on the event poster and time for a short conversation.",
    "partner_instructions": "Play Jordan as friendly but not responsible for carrying the conversation. Share a little, respond to relevant follow-ups, and leave natural pauses. Do not coach during the roleplay.",
    "learning_goal": "Practice beginning with the shared situation, listening to the answer, asking a relevant follow-up, and sharing something in return instead of interviewing.",
    "opening_prompt": "You and Jordan are waiting for a community talk to begin. Start a conversation, then practice listening and following up.",
    "rubric": ["Opens with a relevant shared topic", "Responds to what Jordan actually says", "Balances questions with sharing their own thoughts"]
  }'::jsonb),
  (3, '{
    "title": "Showing interest and respecting boundaries",
    "partner_name": "Alex",
    "setting": "A casual social gathering",
    "hook": "The learner and Alex have been chatting for a few minutes. Alex is engaged at first, then mentions needing to rejoin a friend and begins turning toward them.",
    "partner_instructions": "Play Alex with realistic engagement at first, then give a clear, gentle cue that you are leaving to rejoin a friend. If the learner respects it, respond appreciatively. If they persist, disengage firmly. Do not reward pressure or coach during the roleplay.",
    "learning_goal": "Practice expressing interest while noticing reciprocity and responding respectfully when the other person signals they need to leave.",
    "opening_prompt": "You have been chatting with Alex at a social gathering. Continue the conversation, show interest naturally, and pay attention to Alex’s cues.",
    "rubric": ["Shows interest with considerate language", "Notices signs of engagement or disengagement", "Respects the cue to leave without pressuring Alex"]
  }'::jsonb),
  (4, '{
    "title": "Asking someone on a date",
    "partner_name": "Sam",
    "setting": "After a pleasant conversation at a bookstore event",
    "hook": "The learner and Sam have enjoyed talking after a bookstore event. They are about to head separate ways, giving the learner a natural opportunity to invite Sam to meet again.",
    "partner_instructions": "Play Sam realistically. Give a clear yes, no, or uncertain response based on how the learner asks, but do not guarantee a yes. If the answer is no or uncertain, allow the learner to respond and respect their choice. Do not coach during the roleplay.",
    "learning_goal": "Practice making a direct, specific, low-pressure invitation and accepting the answer graciously.",
    "opening_prompt": "You enjoyed talking with Sam at a bookstore event. The conversation is winding down. Practice inviting Sam on a date in a clear, low-pressure way.",
    "rubric": ["Makes the invitation clear", "Offers a considerate and reasonably specific plan", "Leaves room for no and accepts the answer respectfully"]
  }'::jsonb),
  (5, '{
    "title": "Planning and enjoying a date",
    "partner_name": "Riley",
    "setting": "Planning a first coffee date together",
    "hook": "Riley has agreed to a first date and is discussing where to meet. Riley prefers somewhere quiet and has about an hour available.",
    "partner_instructions": "Play Riley as interested and collaborative. Mention the preference and time limit naturally if it has not come up. Respond to whether the learner listens and works together on a comfortable plan. Do not coach during the roleplay.",
    "learning_goal": "Practice collaborative planning, asking about preferences, listening, and keeping a first date comfortable for both people.",
    "opening_prompt": "You and Riley are planning a first coffee date. Find a comfortable plan together and keep the conversation balanced.",
    "rubric": ["Invites Riley’s preferences into the plan", "Listens and adapts to the quiet-place and time needs", "Keeps the conversation curious, balanced, and considerate"]
  }'::jsonb),
  (6, '{
    "title": "Following up after a date",
    "partner_name": "Casey",
    "setting": "The day after a pleasant first date",
    "hook": "The learner and Casey had a pleasant first date yesterday. The learner is sending a follow-up message. Casey may be interested, uncertain, or not interested; the outcome is not predetermined.",
    "partner_instructions": "Play Casey realistically and choose an honest response that may be positive, uncertain, or a polite no. Let the learner practice responding. If Casey says no, do not change the answer because the learner persists. Do not coach during the roleplay.",
    "learning_goal": "Practice sending a warm, clear follow-up and responding maturely to any answer, including uncertainty or rejection.",
    "opening_prompt": "You went on a pleasant first date with Casey yesterday. Send a follow-up and respond thoughtfully to Casey’s answer.",
    "rubric": ["Sends a warm and clear follow-up", "Expresses interest honestly without overclaiming", "Responds respectfully to Casey’s answer and boundaries"]
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
