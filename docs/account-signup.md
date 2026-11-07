# Account signup

The website now uses Supabase Auth for signup, login, sessions, and password
handling. It no longer queries SIGN_IN from the browser or stores plain passwords
there. Existing integer USER.user_id keys remain unchanged; USER.auth_user_id
stores the separate Auth identity link.

Read [the cutover and legacy-account instructions](supabase-survey-setup.md) before
running [the migration](../supabase/connect_survey_auth.sql). Old SIGN_IN rows are
retained and locked away from browser access. Legacy-only accounts need a one-time
administrator-reviewed link to preserve their old IDs. The historical
sign_in_ensure_user trigger can remain for owner-run reconciliation, but the new
website never inserts into SIGN_IN.
