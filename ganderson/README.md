# Ganderson Part — IS 403

An isolated Beanos management section built with HTML/CSS/JavaScript, Node.js/Express, and Supabase PostgreSQL. The page is labelled **Ganderson Part** and lives at `/ganderson/`. Existing Beanos Auth users and content are untouched. Its own accounts can maintain all users and practice records in this section; do not create accounts for people who should not have management access.

## Included

- Professional responsive landing page with an original Beanos SVG image and login fields named `user_email` and `user_password`.
- Maintain Users and Maintain Records links/buttons appear after successful login.
- Create, display, edit, search, and delete users and practice records. Users have name/email/password; records have title/description/topic/difficulty/time estimate.
- Passwords use salted scrypt hashes, never appear in lists, and can be left unchanged when editing. A password change invalidates that user's sessions. Users cannot delete their currently signed-in account.
- Eight-hour database-backed sessions, HttpOnly/SameSite cookies, Secure cookies in production, CSRF checks, parameterized SQL, and persistent email-based login throttling.
- Logout invalidates the server session, deletes its cookies, and hides management controls. Server checks protect every CRUD endpoint even if someone manually opens a URL.
- Source comments explain authentication, validation, deployment, and table isolation.

## Local setup

Use Node.js 24 LTS and npm. From the repository root:

```sh
npm ci
cp .env.example .env.local
```

Edit `.env.local` privately. Set `DATABASE_URL` to the **Supabase transaction pooler connection URI**, from the project's **Connect** panel, replacing the password placeholder with the database password. URL-encode special password characters. This is a database credential, not an anon key or service role API key. Keep `APP_ORIGIN=http://localhost:3000`. Never commit `.env.local` or send connection secrets in chat.

Remote connections verify the TLS certificate. If your connection needs a specific CA, use the certificate Supabase provides as `DATABASE_CA_CERT` (newlines or escaped `\n` both work). The server uses at most three connections per instance and unnamed parameterized queries compatible with transaction pooling.

Create the isolated schema and grading account:

```sh
npm run setup:ganderson
npm run build
npm start
```

Setup asks for the account's name, email, and a hidden password of 12–128 characters. Use a dedicated grading account, save the credentials privately, and provide them with the deployed URL to the TAs. It creates three sample practice records if the catalog is empty. It refuses to replace an existing account. If tables were already created through the Supabase SQL editor, the same setup command can still create the first account.

Open `http://localhost:3000/ganderson/`. A static Python server cannot run this module's API.

## Vercel deployment

1. Sign in to Vercel with GitHub and allow access to this repository. Import **Section-4-Group-8/Beanos**. The importing account needs the appropriate GitHub organization membership/installation access.
2. Use the **repository root** as Root Directory, not `ganderson/`. Vercel should detect **Express** through `app.js`. Build Command is `npm run build`; leave Output Directory at the Express default. The build places existing Beanos assets and the new module assets in root `public/`, which Vercel serves directly. Keep Node.js at **24.x**.
3. Add private server environment variables `DATABASE_URL` and, if required, `DATABASE_CA_CERT`. Set `APP_ORIGIN` to the exact production origin, e.g. `https://your-project.vercel.app`, with no trailing slash. This origin must match the address used for login. For a separate Preview environment, use its exact stable preview origin; production settings should not point to a preview URL.
4. Run the additive setup above against the intended Supabase project once. It only creates the `ganderson` schema. No original Beanos tables are changed, no original Auth users are modified, and no schema is exposed to Supabase's browser Data API.
5. Deploy the reviewed branch. After deployment, verify `/ganderson/` in a signed-out/private window. Turn off Vercel Deployment Protection for the grading production URL so TAs can reach the app login without a Vercel account. Keep Preview protection as desired.
6. Test the grading account on the production site. Create, read, edit, and delete a disposable user and practice record; reload to verify persistence; log out and confirm the buttons disappear and API access is rejected. Submit the final URL plus the privately stored credentials to your course.
7. To use the existing Beanos Supabase Auth features on the new domain, add that domain's login/recovery callback URLs to the main project's Auth URL configuration. This is separate from Ganderson's cookie login.

The Hobby plan has repository/collaborator restrictions. Check them when connecting the team's GitHub repository; do not move or overwrite teammates' work to bypass access restrictions.

## Database boundaries

`schema.sql` creates `ganderson.users` and `ganderson.records` (the two maintained business tables) plus private `sessions` and `login_limits` tables for security. No record links to or changes the main Beanos user/lesson/task catalogs. All four tables have RLS enabled with no browser policies and schema/table permissions revoked for public/anon/authenticated roles. The server connects using a private owner connection; never put that connection string in frontend files or expose the schema through the Data API.

## Verification

```sh
npm run build
npm run test:ganderson
```

Security/unit tests run without a database. Integration tests require `GANDERSON_TEST_DATABASE_URL` pointing at an **empty disposable local database only**. The integration suite resets its own `ganderson` schema and does not accept a remote test host. It exercises the real PostgreSQL store, login/cookies, validation, authorization, CSRF, both CRUD flows, session revocation, and DOM interactions. This database must have Supabase-like `anon` and `authenticated` roles (no login required) before running `schema.sql`.

A successful local suite does not claim a live Vercel/Supabase deployment. Live setup requires the account connection, database credentials, and the separate production checks above.
