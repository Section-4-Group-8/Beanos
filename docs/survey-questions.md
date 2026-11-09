# Beanos Survey — Questions and Screen Flow

**Status:** Working draft for team review.

This document is the shared reference for the survey wording, answer choices, and screen behavior. Update it as the team refines the survey.

Screen numbers follow the original onboarding outline: the survey runs from Screen 2 through Screen 6.

## Screen 2 — Let’s get to know you

*Tell us a little about yourself so we can help you choose where to start. There are no right or wrong answers.*

### 1. Which best describes your dating experience?

*Choose one.*

- I haven’t been on a date yet.
- I’ve been on dates but haven’t been in a relationship.
- I’ve been in one or more relationships.
- I’d prefer not to answer.

### 2. How do you usually approach conversations with someone new?

*Choose one.*

- I usually start the conversation.
- I usually wait for the other person to start.
- I usually keep to myself.
- My approach varies a lot depending on the situation.

### 3. How comfortable do you feel starting a conversation with someone you’re attracted to?

*Choose one.*

- Very uncomfortable.
- Somewhat uncomfortable.
- Neither comfortable nor uncomfortable.
- Somewhat comfortable.
- Very comfortable.
- I’m not sure yet.

**Button:** Continue.

Each answer reveals the next question on the same screen. Previous questions stay visible and editable.

**Continue requirement:** Select one answer for each of the three questions. “I’d prefer not to answer” and “I’m not sure yet” count as answers.

## Screen 3 — What feels comfortable?

### Which skills feel like strengths, and which would you like to practice?

*Place each action under “Strengths” or “Want to practice.” Any split is fine. Something you haven’t tried yet can go under “Want to practice.”*

**Columns:** Strengths | Want to practice.

**Actions (shown one at a time):**

- Starting a conversation.
- Keeping a conversation going.
- Asking thoughtful follow-up questions.
- Sharing things about myself.
- Expressing romantic interest respectfully.
- Asking someone on a date.
- Planning a date.
- Feeling comfortable during a date.
- Following up after a date.
- Handling rejection.
- Communicating my boundaries.
- Checking whether interest is mutual.

**Interaction:** Drag the current action into a column, use its Place here button, or skip the action. The next action then appears. You can move placed actions between columns and review skipped actions after the last card.

**Button:** Continue.

**Continue requirement:** All 12 actions have been placed or skipped. Each placed action can appear in only one column.

## Screen 4 — What are you working toward?

### What’s your main goal right now?

*Choose the one that matters most to you today. You can change it later.*

- Feel more confident talking to someone I’m interested in.
- Ask someone on a date.
- Feel more comfortable on first dates.
- Build a connection beyond the first date.
- Work toward finding a girlfriend.
- Get back into dating after a break.
- Figure out where to start.

**Button:** Continue.

**Continue requirement:** Select one main goal.

## Screen 5 — Choose where to start

### What would you like to learn first?

*Put these topics in order, with the topic you’re most interested in at the top.*

- Building confidence and handling nerves.
- Starting and continuing conversations.
- Showing interest and respecting boundaries.
- Asking someone on a date.
- Planning and enjoying a date.
- Following up after a date.

**Interaction:** Reorder all six lesson topics into a priority list. Each topic appears once.

**Button:** Finish survey.

**Finish requirement:** All six topics are present in the priority list. Users may keep the starting order if it matches their preferences.

## Screen 6 — You’re ready to begin!

*Thanks for sharing a little about yourself. Explore the lessons and take your next step at your own pace.*

**Future button:** Go to home.

For the standalone survey version, show the completion message and defer the home-page button until the destination is ready.

## Current decisions and scope

- Use “Want to practice” instead of “Weaknesses.”
- The main goal describes what the user wants to work toward. Lesson priorities describe what the user wants to learn first.
- Build the survey as a standalone flow first. Supabase saving, signed-in user association, and connections to index/home pages will be added later.
- Keep answers together in one JavaScript object so saving can be added later without rebuilding the screens.

## Open questions and ideas

- Confirm the lesson topics with the team before treating the six topics above as the final curriculum.
- Add alternative wording and team feedback here as the draft evolves.
