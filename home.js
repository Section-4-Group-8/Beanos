(() => {
  'use strict';

  const api = window.BeanosAPI;
  const content = document.getElementById('home-content');
  const loading = document.getElementById('home-loading');
  const loadingMessage = document.getElementById('home-loading-message');
  const retryActions = document.getElementById('home-retry-actions');
  const retry = document.getElementById('home-retry');
  const signout = document.getElementById('home-signout');
  const adminDashboardLink = document.getElementById('admin-dashboard-link');
  const status = document.getElementById('home-account-status');
  const lessonList = document.getElementById('home-lesson-list');
  const lessons = [
    ['Building confidence and handling nerves', 'confidence'],
    ['Starting and continuing conversations', 'conversations'],
    ['Showing interest and respecting boundaries', 'interest-and-boundaries'],
    ['Asking someone on a date', 'asking-someone-out'],
    ['Planning and enjoying a date', 'date-planning'],
    ['Following up after a date', 'following-up']
  ];
  const goals = new Map([
    ['conversation-confidence', 'Feel more confident talking to someone I’m interested in.'],
    ['ask-on-date', 'Ask someone on a date.'],
    ['comfortable-first-dates', 'Feel more comfortable on first dates.'],
    ['connection-beyond-first-date', 'Build a connection beyond the first date.'],
    ['find-girlfriend', 'Work toward finding a girlfriend.'],
    ['return-to-dating', 'Get back into dating after a break.'],
    ['find-starting-point', 'Figure out where to start.']
  ]);
  let subscription;
  let initializing = false;

  function renderLessons(nextLessonId) {
    lessonList.replaceChildren();
    if (!nextLessonId) {
      const done = document.createElement('p');
      done.className = 'lesson-complete-message';
      done.textContent = 'You’ve completed all six lessons. You can revisit them from the lesson list.';
      lessonList.append(done);
      return;
    }
    const index = nextLessonId - 1;
    const [title] = lessons[index];
    const link = document.createElement('a');
    link.className = 'lesson-choice';
    link.href = `beanos_lesson_template.html?lesson=${nextLessonId}`;
    const number = document.createElement('span');
    number.className = 'lesson-choice-number';
    number.textContent = `LESSON ${nextLessonId}`;
    const name = document.createElement('span');
    name.className = 'lesson-choice-title';
    name.textContent = title;
    link.append(number, name);
    lessonList.append(link);
  }

  function loginChanged() {
    content.hidden = true;
    signout.disabled = true;
    loading.hidden = false;
    loadingMessage.textContent = 'Your login changed. Returning to login…';
    window.location.replace('login_page.html');
  }

  async function initialize() {
    if (initializing) return;
    initializing = true;
    retry.disabled = true;
    retryActions.hidden = true;
    loadingMessage.textContent = 'Loading your home…';
    document.getElementById('home-main').setAttribute('aria-busy', 'true');
    try {
      const account = await api.requireAccount({ completed: true });
      if (!account) return;
      const user = await api.currentUser();
      try {
        const { data:adminEntry, error:adminCheckError } = await api.client
          .from('admin_users')
          .select('auth_user_id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        adminDashboardLink.hidden = Boolean(adminCheckError || !adminEntry);
      } catch {
        adminDashboardLink.hidden = true;
      }
      subscription?.unsubscribe();
      subscription = api.client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || (session && session.user.id !== user.id)) loginChanged();
      }).data.subscription;
      try {
        const survey = await api.loadSurvey();
        document.getElementById('home-goal').textContent = goals.get(survey?.mainGoal) || 'Your next step, at your pace.';
      } catch {
        status.textContent = 'Your saved focus couldn’t load. You can still explore lessons and tasks.';
        status.hidden = false;
      }
      // A second tab can switch accounts while the survey request is in flight.
      if ((await api.currentUser()).id !== user.id) return loginChanged();
      const lessonProgress = await api.loadLessonProgress();
      loading.hidden = true;
      content.hidden = false;
      renderLessons(lessonProgress.nextLessonId);
      signout.disabled = false;
    } catch (error) {
      content.hidden = true;
      loadingMessage.textContent = api?.explain(error) || 'Your home could not load. Please try again.';
      retryActions.hidden = false;
    } finally {
      initializing = false;
      retry.disabled = false;
      document.getElementById('home-main').removeAttribute('aria-busy');
    }
  }

  signout.addEventListener('click', async () => {
    signout.disabled = true;
    try { await api.signOut(); } catch (error) {
      status.textContent = api.explain(error);
      status.hidden = false;
      signout.disabled = false;
    }
  });
  retry.addEventListener('click', initialize);
  initialize();
})();
