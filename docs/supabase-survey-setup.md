# Supabase survey setup

Run [survey_responses.sql](../supabase/survey_responses.sql) once in the project's Supabase SQL Editor. Run the whole file together; it creates the table, timestamp trigger, permissions, and ownership policies in one transaction.

The script creates new objects. If `public.survey_responses` or the timestamp function already exists, it stops and rolls back instead of overwriting the team's schema or data. Compare the existing design before adapting this script.

## Required account setup

Survey ownership uses Supabase Auth user IDs from `auth.users.id`. The app must establish a Supabase Auth session before saving or loading responses. Looking up a row in the custom `SIGN_IN` table does not establish that session.

The table can be created before the login work is finished, but the survey frontend is not connected by this script.

## Table structure

| Column | Purpose |
| --- | --- |
| `user_id` | UUID primary key referencing `auth.users.id`; one current response per user. Defaults to the signed-in user's ID. |
| `answers` | JSONB object matching `window.BeanosSurvey.getAnswers()`. |
| `created_at` | Database-managed time of the first save. |
| `updated_at` | Database-managed time of the latest save. |

The answer object contains `schemaVersion`, `background`, `skills.strengths`, `skills.practice`, `mainGoal`, `lessonPriorities`, and `completedAt`. Keep stable choice IDs and preserve the lesson array's order.

The database checks that `answers` is an object. It does not validate individual answer IDs or require a completed survey; this allows future draft saving. Add server-side content validation if the team needs to enforce completed-only responses. The payload's `completedAt` comes from the browser; the table's timestamps are assigned by the database.

Retaking the survey updates the existing response rather than creating response history. Deleting the Supabase Auth account also deletes its response through the foreign key.

## Access rules

- Signed-out visitors have no read or write access.
- Signed-in users can read, insert, and update only the row whose `user_id` matches their authenticated user ID.
- Both the existing row and the resulting row must belong to the user during an update, so changing `user_id` cannot transfer ownership.
- Client accounts cannot delete responses directly.
- Supabase administrators and trusted service-role operations can bypass RLS. Test ownership rules using signed-in client sessions, not the SQL Editor's administrator identity.

## Future frontend integration

Use the project's publishable key with the signed-in user's session. Keep service-role/secret keys out of frontend code.

After the survey validates all screens, the save operation can use:

```js
const { data: { user }, error: userError } = await client.auth.getUser();
if (userError || !user) throw new Error('Please sign in before saving your survey.');

const { error } = await client.from('survey_responses').upsert(
  { user_id: user.id, answers: window.BeanosSurvey.getAnswers() },
  { onConflict: 'user_id' }
);
if (error) throw error;
```

`client` means the shared Supabase client used by the login page and survey. Make the Finish action wait for this operation before showing completion; the current completion event alone does not wait for asynchronous saves. Preserve the current answers and allow Retry if saving fails.

To restore answers, select `answers` from the signed-in user's row. No row yet is a normal first-time state. Loading the object back into the survey UI still needs implementation.

## Verification with two test accounts

1. Sign in as account A and save a response. Read it back and verify the values and lesson order.
2. Save again as A using the same `user_id`; confirm there is still one row and `created_at` is unchanged.
3. Sign in as B. Confirm A's row is invisible, attempts to insert a response for A are rejected, and an update targeting A affects zero rows.
4. Save B's response, then switch back to A and confirm only A's response is returned.
5. Sign out. Confirm reading and writing are denied. Also confirm a signed-in account cannot delete its response or change its ownership.

SQL Editor reads as an administrator are useful for inspecting saved data but do not prove that RLS works for app users.

References: [Supabase user data](https://supabase.com/docs/guides/auth/managing-user-data), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [JavaScript upsert](https://supabase.com/docs/reference/javascript/upsert).
