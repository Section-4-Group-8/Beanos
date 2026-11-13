-- Add the two tasks used by Beanos OKR 3 and OKR 4. Safe to run repeatedly.
insert into public.task_bank (difficulty, title, description, estimated_minutes)
select incoming.difficulty, incoming.title, incoming.description, incoming.estimated_minutes
from (values
  (5::smallint, 'Go on a date',
   'Complete a date you planned with someone who has agreed to go. Meet in a public place, communicate respectfully, and notice whether you both feel comfortable.',
   60),
  (5::smallint, 'Get a girlfriend',
   'Take one respectful step toward building a mutual romantic relationship, such as meeting new people, expressing genuine interest, or asking someone on a date. Respect the other person’s boundaries and choices.',
   30)
) as incoming(difficulty, title, description, estimated_minutes)
where not exists (
  select 1 from public.task_bank existing
  where lower(trim(existing.title)) = lower(trim(incoming.title))
);
