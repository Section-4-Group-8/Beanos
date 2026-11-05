# Beanos

Beanos helps men build confidence with conversations, dating, and relationships
through lessons and practical tasks.

**Frontend:** HTML, CSS, JavaScript. **Accounts/database:** Supabase Auth and PostgreSQL.

## Run locally

Serve this folder with a local web server, for example `python3 -m http.server 8080`,
then open `http://localhost:8080/login_page.html`. Account and survey features need
an internet connection and the matching Supabase migration. Do not open the pages
as file URLs. There is no index/home page yet.

## Account and survey flow

Create an account once, then log in normally. Supabase Auth handles passwords and
signed sessions. Incomplete surveys route to Survey; completed surveys route to
Profile. Survey Finish waits for a successful database save, and saved answers
reload on return. Retakes update the same row. The completion screen links to Profile.

Survey responses belong to the existing integer USER.user_id. USER.auth_user_id
links that ID to the Auth account. The browser never chooses another user's ID.
Legacy-only accounts require a one-time reviewed account link; see the setup guide.
Email confirmation is optional and can be enabled later without changing the code.

- [Database/login deployment and legacy accounts](docs/supabase-survey-setup.md)
- [Signup notes](docs/account-signup.md)
- [Survey questions and screen flow](docs/survey-questions.md)
- [Survey page](survey.html) · [Team style guide](Beanos_style_guide.html)
- [Database migration](supabase/connect_survey_auth.sql)

The task page is still a separate work in progress. Current survey progress bars
show survey steps; lesson-unlock progress is separate future work.

## Verify

Run `npm ci && npm test` for browser-behavior tests. The website itself needs no
build step. Database tests and live verification steps are in the setup guide.

After deployment: sign up, finish Survey, open Profile, reload Survey and confirm
the answers remain. Retake and confirm only one response exists under your integer
ID. Log out, log in again, and repeat with a second account to check separation.

**ERD:** ![ERD](images/erd2.png)
