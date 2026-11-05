# Beanos (Dating Confidence App)

**App Summary**
This app is designed to help young men overcome the anxiety and lack of confidence that prevents them from finding a girlfriend. Many men struggle to talk to women, plan dates, or act naturally, creating a negative feedback loop of rejection and reluctance. This app uses a lesson format to teach relationship and dating skills, helping users break this cycle and build confidence.

**Tech Stack**
* **Frontend:** HTML/CSS/JavaScript
* **Backend:** Node.js, Supabase
* **Why this stack:** The product is web-based, and our group is most comfortable with the HTML/JS platform. Supabase provides a free, easy-to-use alternative to heavier database options.

**User Flow & Features**
* **Sign Up Routing:** New users register and are immediately routed to the standalone Survey Page (`survey.html`). Upon survey completion (which dispatches a `beanos:survey-completed` event), users are routed to their Profile Page.
* **Log In Routing:** Returning users who log in are routed directly to the Profile Page.
* **Profile Page:** Users can view and update their personal account information and settings.
* **Data Architecture:** 
  * Account signup creates a matching `USER` record atomically when the registration page inserts into `SIGN_IN`.
  * Survey responses generate one record per `USER.user_id` (int8).

**How to Get It Running**
1. In this GitHub repository, click the green "Code" button.
2. Select "Download Zip" from the drop-down menu.
3. Extract the `.zip` file and open `index.html` in your browser. (If it does not open automatically, right-click the file -> "Open with" -> select your preferred web browser).

**Verifying the Vertical Slice**
1. **Action & Input (Registration):** Enter `testemail@gmail.com` into the email field, enter `testpassword`, and click the "Register" button.
2. **Survey Flow:** Verify that registration routes you directly to the Survey Page. Complete the survey steps.
3. **Profile Routing & Persistence:** Verify that completing the survey lands you on the Profile Page. Change a piece of account info, refresh the browser (Command/Control + R), and ensure the changes persist.
4. **Log In Flow:** Log out of the test account, then log back in with `testemail@gmail.com` and `testpassword`. Verify that the app bypasses the survey and takes you directly to the Profile Page.
