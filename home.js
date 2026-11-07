(() => {
  'use strict';

  const api = window.BeanosAPI;
  const content = document.getElementById('home-content');
  const loading = document.getElementById('home-loading');
  const loadingMessage = document.getElementById('home-loading-message');
  const retryActions = document.getElementById('home-retry-actions');
  const retry = document.getElementById('home-retry');
  const signout = document.getElementById('home-signout');
  const status = document.getElementById('home-account-status');
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
      loading.hidden = true;
      content.hidden = false;
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
