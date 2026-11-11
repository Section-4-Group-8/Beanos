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

  async function loadLessonTasks(lessonId) {
    // Future assignment hook: replace this catalog filter with a user-specific
    // assigned-task query once those account records are available.
    if (!Number.isInteger(Number(lessonId)) || Number(lessonId) < 1 || Number(lessonId) > 6) {
      throw new Error('That lesson number is not valid.');
    }
    const { data, error } = await ready().from('task_bank')
      .select('id,lesson_id,difficulty,title,description,estimated_minutes')
      .eq('lesson_id', lessonId)
      .order('difficulty', { ascending: true })
      .order('title', { ascending: true });
    if (error) throw new Error(explain(error));
    return data || [];
  }

  function readLessonTaskProgress(userId) {
    const storageKey = `beanos_lesson_tasks:${userId}`;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); }
    catch { saved = {}; }
    const completedTasks = saved && typeof saved.completedTasks === 'object' && saved.completedTasks ? saved.completedTasks : {};
    const starsByLesson = {};
    const completedTaskIdsByLesson = {};
    for (let lessonId = 1; lessonId <= 6; lessonId += 1) {
      const tasks = completedTasks[lessonId] && typeof completedTasks[lessonId] === 'object' ? completedTasks[lessonId] : {};
      const entries = Object.entries(tasks).filter(([, difficulty]) => Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5);
      completedTaskIdsByLesson[lessonId] = entries.map(([taskId]) => taskId);
      starsByLesson[lessonId] = entries.reduce((sum, [, difficulty]) => sum + difficulty, 0);
    }
    let unlockedThrough = 1;
    while (unlockedThrough < 6 && starsByLesson[unlockedThrough] >= 10) unlockedThrough += 1;
    const nextLessonId = starsByLesson[unlockedThrough] >= 10 ? null : unlockedThrough;
    return {
      completedLessons: Object.keys(starsByLesson).map(Number).filter(id => starsByLesson[id] >= 10),
      completedTaskIdsByLesson,
      starsByLesson,
      nextLessonId,
      unlockedThrough
    };
  }

  async function loadLessonProgress(expectedUserId) {
    const user = await currentUser();
    if (expectedUserId && user.id !== expectedUserId) throw new Error('Your login changed. Return to the lesson using your current account.');
    return readLessonTaskProgress(user.id);
  }

  async function completeLessonTask(lessonId, task, expectedUserId) {
    if (!Number.isInteger(lessonId) || lessonId < 1 || lessonId > 6 || Number(task?.lesson_id) !== lessonId) {
      throw new Error('That lesson number is not valid.');
    }
    const taskId = String(task?.id ?? '');
    const difficulty = Number(task?.difficulty);
    if (!taskId || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
      throw new Error('That task is missing a valid difficulty.');
    }
    const user = await currentUser();
    if (expectedUserId && user.id !== expectedUserId) throw new Error('Your login changed. Return to the lesson using your current account.');
    const progress = readLessonTaskProgress(user.id);
    if (lessonId > progress.unlockedThrough) {
      throw new Error('Complete tasks for the available lesson before opening this lesson.');
    }
    if (progress.starsByLesson[lessonId] >= 10) return progress;
    const storageKey = `beanos_lesson_tasks:${user.id}`;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); }
    catch { saved = {}; }
    if (!saved || typeof saved !== 'object') saved = {};
    if (!saved.completedTasks || typeof saved.completedTasks !== 'object') saved.completedTasks = {};
    saved.completedTasks[lessonId] = saved.completedTasks[lessonId] || {};
    if (!saved.completedTasks[lessonId][taskId]) saved.completedTasks[lessonId][taskId] = difficulty;
    // Prototype storage seam: replace this local save with a Supabase RPC
    // (for example, beanos_complete_lesson_task) when user task records exist.
    localStorage.setItem(storageKey, JSON.stringify(saved));
    return readLessonTaskProgress(user.id);
  }

  window.BeanosAPI = Object.freeze({
    get client() { return ready(); }, callbackUrl, explain, currentUser,
    requireAccount, destination, signOut,
    goHome: () => window.location.assign('index.html'),
    loadSurvey: () => rpc('beanos_get_survey'),
    // Ownership comes exclusively from auth.uid() inside the database function.
    saveSurvey: answers => rpc('beanos_save_survey', { p_answers: answers }),
    loadLessonResources,
    loadLessonTasks,
    loadLessonProgress,
    completeLessonTask
  });
})();
