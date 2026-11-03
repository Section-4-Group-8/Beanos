# Beanos
**App Summary:** The problem we are trying to solve is that men are struggling to get a girlfriend. This is because men don’t feel comfortable talking to women, struggle to plan fun dates, and act awkward on those dates. This prevents the relationship from growing into a second date and onward. This creates a negative-feedback loop where even if a guy talks himself into approaching a girl, he has built-up anxiety that prevents him from getting anything other than a rejection, further feeding into his anxiety and reluctance to try again. The men experiencing this problem are typically young men that have low confidence and are inexperienced with women. The app has a lesson format to teach these skills that men lack, leading to men finding a girlfriend.

**Survey planning:** [Survey questions and screen flow](docs/survey-questions.md) — Draft wording, answer choices, and interaction rules.

**Standalone survey:** Open [survey.html](survey.html) directly in a browser. Its styles and behavior live in `survey.css` and `survey.js`, using the colors, typography, and components from [the team style guide](Beanos_style_guide.html). No setup or Supabase connection is needed. Answers stay in memory while the page is open; refreshing starts a new survey. The survey does not navigate to the existing index or home pages.

For future integration, `window.BeanosSurvey.getAnswers()` returns a copy of the current answers with stable choice IDs. Completing the survey also dispatches a `beanos:survey-completed` event on `document`, with the answers in `event.detail`.

**Survey database setup:** [SQL and teammate setup instructions](docs/supabase-survey-setup.md) — Creates one survey response per Supabase Auth user with owner-only access rules.

**ERD:** ![ERD](images/erd2.png)

**Tech Stack:** HTML/CSS/JavaScript, Node.Js, Supabase. This fits our team because our product is going to be web-based, and our group is most comfortable with the HTML/JS platform. Supabase is a free and easy to use tool so we went with that over other options.

**How to Get It Running:**
1. In this GitHub repository, navigate to the green "Code" button
2. In the drop down menu, select "Download Zip"
3. Open the .zip file and click on "Index.html" to open the file in your browser
    a. If this doesn't work, right-click the file and select "Open with" and select your browser

**Verifying the Vertical Slice:**x  
1. **Action & Input:** Enter `testemail@gmail.com` into the email field, and ‘testpassword’ and click the “Register” button. 
2. **Check Immediate Feedback:** Ensure the UI updates dynamically to show `"User saved to database successfully!"`. 
3. **Verify Persistence:** Refresh the browser (`Command/Control + r`). Verify that `"testemail@gmai.com"` is still displayed after the reload.
