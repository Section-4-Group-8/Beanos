# Survey saving and login

Survey answers save under the existing integer `USER.user_id`. The new nullable
`USER.auth_user_id` links that profile to a Supabase Auth login. UUIDs do not replace
any existing integer foreign keys.

## Deploy the database and frontend together

1. Review and run [connect_survey_auth.sql](../supabase/connect_survey_auth.sql) once
   as the project owner, while signup email confirmation is still enabled. Existing
   IDs/rows remain intact. Already-confirmed Auth accounts are linked only where
   the legacy account emails agree. No passwords are imported or reset.
2. Publish the frontend files from the same change. Old site versions querying
   `SIGN_IN` directly stop working after the database permissions are closed.
3. In Authentication → URL Configuration, use Site URL
   `https://section-4-group-8.github.io/Beanos/login_page.html`. Allow that URL and
   `https://section-4-group-8.github.io/Beanos/login_page.html?recovery=1` as redirects.
   Local development needs equivalent localhost URLs added separately.
4. The team requested signup without an email confirmation link. After the SQL
   cutover, disable **Confirm email** in Sign In / Providers. Keep email/password
   login enabled and anonymous login disabled. Re-enabling Confirm email later
   requires no page-code changes.

Review these live permission/login changes before applying. The migration runs
once; do not rerun it or run `tests/database.sql` in the live project.

## Existing accounts

New users register once and then log in normally. Existing Supabase Auth users can
log in normally too. Old accounts that exist only in `SIGN_IN` need a one-time Auth
registration and an administrator-reviewed link to their original integer ID.
New registrations never claim old data solely because an email matches: signup
email confirmation is optional, so email equality cannot prove ownership.

For a legacy link, independently verify the person, their original USER/SIGN_IN
records, and their Auth account. An owner can then set only the reviewed USER row's
`auth_user_id` in the Dashboard, leaving `user_id` intact. The unique constraint
prevents one Auth identity being attached to multiple profiles. Conflicting legacy
emails need team review. Do not create a client endpoint accepting a target ID.

`SIGN_IN` rows remain intact for reconciliation, but all browser access is removed.
The new app never reads/writes those old password fields. Retiring those records
is separate cleanup. Password hashing, signed sessions, email changes, and password
changes now use Supabase Auth. Email changes and forgotten-password emails can
still require an inbox link independently of the signup confirmation setting.

## Saving and ownership

- `beanos_account()` resolves the authenticated identity to the integer ID. IDs are
  returned as strings to preserve full int8 precision. Browser localStorage IDs
  are never trusted.
- `beanos_save_survey(p_answers)` accepts only answers, derives ownership from
  `auth.uid()`, validates the complete questionnaire, and upserts that user's row.
  It requires six distinct skills, all six ordered lesson topics, valid background
  and goal choices, and schema version 1. Server time replaces the completion time.
- `beanos_get_survey()` returns only that user's answers. Saved answers load when
  reopening the survey. Finish waits for saving; failures preserve the current
  answers for Retry. Completion events fire only after database success.
- Retakes update the same response, preserving creation time and changing update
  time. Profile requires a completed saved survey. A successful save redirects to Home (`index.html`); completed users also land
  there after login. Home requires a completed survey and provides links to the
  existing lesson template, task picker, Profile, and the survey.
- Unsaved edits stay in memory. Refreshing before finishing loses those edits;
  draft saving is not included.

RLS is enabled on USER, SIGN_IN, and survey_responses. Browser table/column and
sequence privileges are revoked. Only the three scoped account/survey RPCs are
executable by authenticated users; anonymous users cannot call them. These
security-definer functions have an empty search path, check the Auth record, and
never accept a target user ID. Their owners must remain trusted. Only the
publishable key belongs in the browser; never add a secret/service-role key.

## Tests

`npm ci && npm test` checks pending saves, retry, persisted answers, changed logins,
Auth signup modes, and save requests without an ownership ID.

`tests/database.sql` is an isolated local fixture that checks two-user separation,
anonymous denial, malformed answers, retakes/timestamps, exact int8 IDs, and legacy
link protection. Run with `psql -v ON_ERROR_STOP=1 -f tests/database.sql` only in an
empty disposable local database whose test cluster has anon/authenticated roles.

After deployment, create a disposable account, finish the survey, refresh, and
confirm one response under its integer ID. Retake and verify the same row updates.
Log out and check that a second account sees only its own answers.

References: [Supabase password login](https://supabase.com/docs/guides/auth/passwords),
[database access](https://supabase.com/docs/guides/database/postgres/row-level-security),
[redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
