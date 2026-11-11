# Beanos

Beanos helps men build confidence with conversations, dating, and relationships
through lessons and practical tasks.

**Frontend:** HTML, CSS, JavaScript. **Accounts/database:** Supabase Auth and PostgreSQL.

## Run locally

Serve this folder with a local web server, for example `python3 -m http.server 8080`,
then open `http://localhost:8080/login_page.html`. Account and survey features need
an internet connection and the matching Supabase migration. Do not open the pages
as file URLs. The signed-in home page is `index.html`.

## Account and survey flow

Create an account once, then log in normally. Supabase Auth handles passwords and
signed sessions. Incomplete surveys route to Survey; completed surveys route to
Home. Survey Finish waits for a successful database save, and saved answers
reload on return. Retakes update the same row. After a successful survey save, the app opens Home.

Survey responses belong to the existing integer USER.user_id. USER.auth_user_id
links that ID to the Auth account. The browser never chooses another user's ID.
Home shows the saved survey goal and the next available lesson. The Lessons page
shows the full sequence and unlock progress. The lesson template loads ordered
resources from `lesson_resources` and lesson-specific tasks from `task_bank`,
using each row's `lesson_id`. The signed-in role needs `SELECT` access to both
tables (with row-level security enabled, allow authenticated users to read the
lesson and task catalogs).

Lesson stars and task completion are currently a signed-in-browser prototype:
each completed task awards stars equal to its difficulty, and 10 stars from a
lesson unlock the next one. Stars do not carry between lessons. Progress is
stored in local storage, scoped by Supabase Auth user. The `loadLessonTasks`,
`loadLessonProgress`, and `completeLessonTask` methods in `beanos-api.js` are
the integration seams for user-specific task assignments and completions in
Supabase later.

Legacy-only accounts require a one-time reviewed account link; see the setup guide.
Email confirmation is optional and can be enabled later without changing the code.

- [Database/login deployment and legacy accounts](docs/supabase-survey-setup.md)
- [Signup notes](docs/account-signup.md)
- [Survey questions and screen flow](docs/survey-questions.md)
- [Survey page](survey.html) · [Team style guide](Beanos_style_guide.html)
- [Database migration](supabase/connect_survey_auth.sql)

The standalone Tasks page remains a separate picker; its tasks are not yet part
of the lesson-star unlock flow.

## Verify

Run `npm ci && npm test` for browser-behavior tests. The website itself needs no
build step. Database tests and live verification steps are in the setup guide.

After deployment: sign up, finish Survey, arrive at Home, then reload Survey and confirm
the answers remain. Retake and confirm only one response exists under your integer
ID. Log out, log in again, and repeat with a second account to check separation.

**ERD:** ![ERD](images/erd2.png)
