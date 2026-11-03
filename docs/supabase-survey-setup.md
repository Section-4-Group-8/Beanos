# Supabase survey setup

The survey uses the existing `public."USER".user_id` key. Its PostgreSQL type is `bigint`, which Supabase displays as `int8`. It does not reference `auth.users` or require a UUID.

## Choose the appropriate SQL file

- **New setup:** run [survey_responses.sql](../supabase/survey_responses.sql) once after the existing `USER` table is available.
- **Original UUID table already created:** run [migrate_survey_user_id_to_bigint.sql](../supabase/migrate_survey_user_id_to_bigint.sql) once. This migration only accepts the original, empty UUID table and refuses populated tables. Existing responses would need an explicit mapping to the integer user IDs.

Run an entire file together in Supabase's SQL Editor as the project owner. Do not run both files on the same installation. The migration preserves the answer and timestamp columns and the timestamp trigger.

## Table structure

| Column | Purpose |
| --- | --- |
| `user_id` | `bigint`/`int8` primary key referencing `public."USER" (user_id)`; one current response per user. Supply the existing user's ID; it has no generated default. |
| `answers` | JSONB object matching `window.BeanosSurvey.getAnswers()`. |
| `created_at` | Database-managed time of the first save. |
| `updated_at` | Database-managed time of the latest save. |

The payload contains `schemaVersion`, `background`, `skills.strengths`, `skills.practice`, `mainGoal`, `lessonPriorities`, and `completedAt`. Keep stable choice IDs and preserve the lesson array's order. The database requires an object but does not validate individual answers or require completion, allowing future draft saving.

Retakes update the existing row. Deleting a `USER` record cascades to its survey response. Deleting a `SIGN_IN` record alone does not delete the response.

## Access model for the custom login

An integer user ID is a relationship key, not proof of identity. The current browser-based `SIGN_IN` lookup does not give PostgreSQL a verified custom-user session. The original `auth.uid()` ownership policies therefore do not apply to this schema.

RLS remains enabled, all grants to `PUBLIC`, `anon`, and `authenticated` are revoked, and no browser policies are created. Direct browser reads and writes are denied. This also applies to a Supabase Auth session until the team adds an explicit identity-to-USER mapping and corresponding policies.

The scripts grant `service_role` SELECT, INSERT, and UPDATE for a trusted backend. That role bypasses RLS, so the backend must enforce ownership on every read and write. Keep its secret key on the server, never in `survey.js` or other frontend files.

## Future saving flow

1. Establish a verified custom login/session on a backend.
2. Send survey answers to that backend; derive `user_id` from the verified session instead of trusting an ID supplied by the browser.
3. Use a parameterized upsert with the existing integer ID:

```sql
insert into public.survey_responses (user_id, answers)
values ($1::bigint, $2::jsonb)
on conflict (user_id) do update set answers = excluded.answers;
```

4. Return only the current user's response when loading answers.
5. Make Finish wait for the save to succeed before showing completion; keep answers available for Retry on failure.

The SQL does not implement the backend or connect the survey frontend. Avoid converting large int8 identifiers to JavaScript Number; preserve their exact decimal representation when passing them between browser and backend.

## Verification

- Confirm `survey_responses.user_id` is `int8`, references `public."USER" (user_id)`, and has no `auth.uid()` default or policies.
- Confirm public/browser roles cannot read or write any response.
- Through the trusted backend, save twice for one existing USER and verify there is one row, with an unchanged creation time and an updated modification time.
- Reject unknown user IDs through the foreign key, preserve lesson order, and verify the backend cannot expose another user's response through a supplied request parameter.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [PostgreSQL integer types](https://www.postgresql.org/docs/current/datatype-numeric.html#DATATYPE-INT).
