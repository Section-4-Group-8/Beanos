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
    return account.surveyCompleted ? 'index.html' : 'survey.html';
  }

  async function signOut() {
    const { error } = await ready().auth.signOut();
    if (error) throw error;
    // Remove the obsolete, unverified account hints from the old login.
    localStorage.removeItem('active_user_id');
    localStorage.removeItem('active_user_email');
    window.location.replace('login_page.html');
  }

  async function loadLessonResources(lessonId) {
    const { data, error } = await ready().from('lesson_resources')
      .select('id,lesson_id,title,type,platform,url,focus_summary,sort_order')
      .eq('lesson_id', lessonId)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true });
    if (error) throw new Error(explain(error));
    return data || [];
  }

  function lessonProgressFor(userId) {
    const storageKey = `beanos_lesson_progress:${userId}`;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); }
    catch { saved = {}; }
    const completedLessons = [...new Set((Array.isArray(saved.completedLessons) ? saved.completedLessons : [])
      .filter(id => Number.isInteger(id) && id >= 1 && id <= 6))].sort((a, b) => a - b);
    let highestCompleted = 0;
    while (completedLessons.includes(highestCompleted + 1)) highestCompleted += 1;
    const nextLessonId = highestCompleted < 6 ? highestCompleted + 1 : null;
    return {
      completedLessons,
      nextLessonId,
      unlockedThrough: Math.min(nextLessonId || 6, 6)
    };
  }

  async function loadLessonProgress(expectedUserId) {
    const user = await currentUser();
    if (expectedUserId && user.id !== expectedUserId) throw new Error('Your login changed. Return to the lesson using your current account.');
    return lessonProgressFor(user.id);
  }

  async function completeLessonTasks(lessonId, expectedUserId) {
    if (!Number.isInteger(lessonId) || lessonId < 1 || lessonId > 6) {
      throw new Error('That lesson number is not valid.');
    }
    const user = await currentUser();
    if (expectedUserId && user.id !== expectedUserId) throw new Error('Your login changed. Return to the lesson using your current account.');
    const progress = lessonProgressFor(user.id);
    if (lessonId > progress.unlockedThrough) {
      throw new Error('Complete the available lesson tasks before unlocking this lesson.');
    }
    if (!progress.completedLessons.includes(lessonId)) {
      progress.completedLessons.push(lessonId);
      progress.completedLessons.sort((a, b) => a - b);
    }
    // Prototype storage seam: replace this local save with a Supabase RPC
    // (for example, beanos_complete_lesson_tasks) when task completion is live.
    localStorage.setItem(`beanos_lesson_progress:${user.id}`, JSON.stringify({
      completedLessons: progress.completedLessons
    }));
    return lessonProgressFor(user.id);
  }

  window.BeanosAPI = Object.freeze({
    get client() { return ready(); }, callbackUrl, explain, currentUser,
    requireAccount, destination, signOut,
    goHome: () => window.location.assign('index.html'),
    loadSurvey: () => rpc('beanos_get_survey'),
    // Ownership comes exclusively from auth.uid() inside the database function.
    saveSurvey: answers => rpc('beanos_save_survey', { p_answers: answers }),
    loadLessonResources,
    loadLessonProgress,
    completeLessonTasks
  });
})();
