# Beanos

Beanos helps men build confidence with conversations, dating, and relationships through personalized lessons and practical tasks.

[Open Beanos](https://section-4-group-8.github.io/Beanos/login_page.html) · [Welcome page](https://section-4-group-8.github.io/Beanos/welcome.html)

HTML, CSS, and JavaScript frontend hosted on GitHub Pages. Supabase provides authentication, PostgreSQL, and Edge Functions. Google Gemini powers AI features.

## Features

| Area | Features |
| --- | --- |
| Survey | Background, strengths, practice areas, goals, and lesson priorities. Saved answers can be reviewed or updated. |
| Home | Survey focus, the next available lesson, and a daily task from completed lessons when eligible tasks are available. |
| Lessons | Six personalized lessons with articles, videos, AI roleplay, and recommended tasks. AI order suggestions save only after **Use this order**. Previously unlocked lessons stay available. |
| Tasks | Current tasks, difficulty levels, star progress, completed-task history, and repeat attempts. |
| Reflections | Saved task ratings and written reflections. |
| Profile | Account details, email/password updates, survey access, logout, and four saved Beanos avatar colors. |

Users register once. Completing the survey opens Home. Returning users with a completed survey go to Home after login. Password recovery is available from Login.

## Run locally

```sh
git clone https://github.com/Section-4-Group-8/Beanos.git
cd Beanos
python3 -m http.server 8000
```

Open [the local login page](http://localhost:8000/login_page.html). There is no frontend build step. Local use connects to the team's Supabase project and requires a network connection. Email confirmation and recovery need matching localhost callback URLs configured in Supabase.

## Data and backend setup

- Existing integer `USER.user_id` values link to Supabase Auth through `USER.auth_user_id`.
- Survey answers, accepted lesson orders, completed lessons, current tasks, task completions, ratings, and reflections save in Supabase. Avatar colors use Auth user metadata.
- Lesson stars and previously unlocked lesson IDs also use per-user browser storage. Star totals can differ across devices.
- Database setup requires the team's existing schema and catalog data, plus applicable SQL in [supabase/](supabase/). Start with [account/survey setup and legacy-account linking](docs/supabase-survey-setup.md).
- Lesson content uses `lesson_resources`, `lesson_task_recommendations`, and `task_bank`. See [roleplay configuration](supabase/lesson_roleplay_config.sql).
- Set `GEMINI_API_KEY` in Supabase Edge Function secrets and deploy [lesson-roleplay](supabase/functions/lesson-roleplay/index.ts) and [suggest-lesson-order](supabase/functions/suggest-lesson-order/index.ts).
- Only publishable Supabase keys belong in the frontend. Keep private keys on the backend and enforce account ownership through database permissions and row-level security.

## Development

With Node.js and npm installed, run the frontend tests using simulated services.

```sh
npm ci
npm test
```

[Database tests](tests/database.sql) require a disposable local database. Follow [the test setup](docs/supabase-survey-setup.md#tests).

Fetch the latest `main`, integrate teammates' changes, and review your commit's files before pushing.

## Project references

- [Survey questions and screen flow](docs/survey-questions.md)
- [Beanos style guide](Beanos_style_guide.html)
- [Account signup notes](docs/account-signup.md)
- [Database diagram](images/erd2.png)
