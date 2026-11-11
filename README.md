# Beanos

Beanos helps men build confidence with conversations, dating, and relationships
through lessons and practical tasks.

**Frontend:** HTML, CSS, JavaScript. **Accounts/database:** Supabase Auth and PostgreSQL.

## Open URL in your browser

The current URL we have is posted through GitHub pages, open https://section-4-group-8.github.io/Beanos/login_page.html

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

<<<<<<< Updated upstream
The standalone Tasks page remains a separate picker; its tasks are not yet part
of the lesson-star unlock flow.
=======
## Home page
>>>>>>> Stashed changes

After the survey, you will redirected to the home page. From there you have a few options: Tasks, Lessons, or Profile

From the profile page you can update your email or password

From the Tasks page, you will see a list of tasks that are sorted by difficulty/length

From the Lessons page, you will be able to browse lessons to learn from several media sources, including articles, videos, and an AI chatbot. 

**ERD:** ![ERD](images/erd2.png)
