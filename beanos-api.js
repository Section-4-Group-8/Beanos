(() => {
  'use strict';

  // Publishable browser key only. Never put a secret/service-role key here.
  const client = window.supabase?.createClient(
    'https://bzqepyhnvvrwzafydeqp.supabase.co',
    'sb_publishable_VbXs3R4Y6H4bVS63j2KkoA_g0trAUp5'
  );
  const callbackUrl = new URL('login_page.html', window.location.href).href;

  function ready() {
    if (!client) throw new Error('The account service could not load. Check your connection and try again.');
    return client;
  }

  function explain(error) {
    const message = error?.message || 'Something went wrong. Please try again.';
    if (message.includes('LEGACY_ACCOUNT_LINK_REQUIRED')) {
      return 'This email has an older Beanos account. Ask your team administrator to link it to your new login so you keep your original user ID.';
    }
    if (message.includes('ACCOUNT_EMAIL_CONFLICT')) {
      return 'This email belongs to an older account. Ask your team administrator to review the account link.';
    }
    return message;
  }

  async function rpc(name, args) {
    const { data, error } = await ready().rpc(name, args);
    if (error) throw new Error(explain(error));
    return data;
  }

  async function currentUser() {
    const { data, error } = await ready().auth.getUser();
    if (error || !data.user) throw new Error('Please log in to continue.');
    return data.user;
  }

  async function requireAccount({ completed = false } = {}) {
    // The server validates the Auth token; localStorage IDs are never used.
    try { await currentUser(); } catch (error) {
      if (!client) throw error;
      window.location.replace('login_page.html');
      return null;
    }
    const account = await rpc('beanos_account');
    if (completed && !account.surveyCompleted) {
      window.location.replace('survey.html');
      return null;
    }
    return account;
  }

  async function destination() {
    const account = await rpc('beanos_account');
    return account.surveyCompleted ? 'profile.html' : 'survey.html';
  }

  async function signOut() {
    const { error } = await ready().auth.signOut();
    if (error) throw error;
    // Remove the obsolete, unverified account hints from the old login.
    localStorage.removeItem('active_user_id');
    localStorage.removeItem('active_user_email');
    window.location.replace('login_page.html');
  }

  window.BeanosAPI = Object.freeze({
    get client() { return ready(); }, callbackUrl, explain, currentUser,
    requireAccount, destination, signOut,
    loadSurvey: () => rpc('beanos_get_survey'),
    // Ownership comes exclusively from auth.uid() inside the database function.
    saveSurvey: answers => rpc('beanos_save_survey', { p_answers: answers })
  });
})();
