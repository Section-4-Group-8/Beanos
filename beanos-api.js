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

  async function waitForResponse(promise, action, timeoutMs = 15000) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((resolve, reject) => {
          timer = window.setTimeout(() => reject(new Error(`${action} is taking too long. Check your connection and try again.`)), timeoutMs);
        })
      ]);
    } finally {
      window.clearTimeout(timer);
    }
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
    const { data, error } = await waitForResponse(ready().rpc(name, args), 'Loading your account details');
    if (error) throw new Error(explain(error));
    return data;
  }

  async function currentUser() {
    const { data, error } = await waitForResponse(ready().auth.getUser(), 'Checking your login');
    if (error || !data.user) throw new Error('Please log in to continue.');
    return data.user;
  }

  async function currentSessionUser() {
    const { data, error } = await waitForResponse(ready().auth.getSession(), 'Reading your saved login');
    if (error || !data.session?.user) throw new Error('Please log in to continue.');
    return data.session.user;
  }

  async function requireAccount({ completed = false } = {}) {
    // The local session supplies only the auth UUID for browser progress. The
    // account RPC validates the token with Supabase before granting access.
    let user;
    try { user = await currentSessionUser(); } catch (error) {
      if (error?.message?.includes('taking too long')) throw error;
      if (!client) throw error;
      window.location.replace('login_page.html');
      return null;
    }
    const account = await rpc('beanos_account');
    if (completed && !account.surveyCompleted) {
      window.location.replace('survey.html');
      return null;
    }
    return { ...account, authUserId: user.id };
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
    const { data, error } = await waitForResponse(ready().from('lesson_resources')
      .select('id,lesson_id,title,type,platform,url,focus_summary,sort_order')
      .eq('lesson_id', lessonId)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true }), 'Loading lesson resources');
    if (error) throw new Error(explain(error));
    return data || [];
  }

  async function loadLessonRoleplayConfig(lessonId) {
    const { data, error } = await waitForResponse(ready().from('lesson_resources')
      .select('roleplay_config')
      .eq('lesson_id', lessonId)
      .not('roleplay_config', 'is', null)
      .maybeSingle(), 'Loading the roleplay scenario');
    if (error) throw new Error(explain(error));
    return data?.roleplay_config || null;
  }

  async function loadLessonTasks(lessonId) {
    if (!Number.isInteger(Number(lessonId)) || Number(lessonId) < 1 || Number(lessonId) > 6) {
      throw new Error('That lesson number is not valid.');
    }
    const { data: recommendation, error: recommendationError } = await waitForResponse(ready()
      .from('lesson_task_recommendations').select('task_ids').eq('lesson_id', lessonId).single(), 'Loading recommended lesson tasks');
    if (recommendationError) throw new Error(explain(recommendationError));
    const ids = recommendation?.task_ids || [];
    if (!ids.length) return [];
    const { data, error } = await waitForResponse(ready().from('task_bank')
      .select('id,lesson_id,difficulty,title,description,estimated_minutes')
      .in('id', ids), 'Loading recommended lesson tasks');
    if (error) throw new Error(explain(error));
    const byId = new Map((data || []).map(task => [String(task.id), task]));
    return ids.map(id => byId.get(String(id))).filter(Boolean);
  }

  async function loadCurrentTaskIds() {
    const ids = await rpc('beanos_get_current_tasks');
    return Array.isArray(ids) ? [...new Set(ids.map(String))] : [];
  }

  async function addCurrentTasks(taskIds) {
    const ids = [...new Set((taskIds || []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
    if (!ids.length) return loadCurrentTaskIds();
    return rpc('beanos_add_current_tasks', { p_task_ids: ids });
  }

  async function removeCurrentTask(taskId) {
    return rpc('beanos_remove_current_task', { p_task_id: Number(taskId) });
  }

  async function startLessonTaskAssignment(lessonId, expectedUserId) {
    if (!Number.isInteger(Number(lessonId)) || Number(lessonId) < 1 || Number(lessonId) > 6) {
      throw new Error('That lesson number is not valid.');
    }
    const user = await currentUser();
    if (expectedUserId && user.id !== expectedUserId) throw new Error('Your login changed. Return to the lesson using your current account.');
    const assignmentId = await rpc('beanos_assign_lesson_tasks', { p_lesson_id: Number(lessonId) });
    if ((await currentSessionUser()).id !== user.id) throw new Error('Your login changed. Return to the lesson using your current account.');
    if (!assignmentId) throw new Error('The recommended tasks could not be assigned. Please try again.');
    return assignmentId;
  }

  async function invokeLessonFunction(name, body, fallbackMessage) {
    const { data, error } = await ready().functions.invoke(name, { body });
    if (error) {
      let responseBody = null;
      try {
        if (error.context?.clone) responseBody = await error.context.clone().json();
      } catch { /* Keep the SDK message if the function response is not JSON. */ }
      const message = responseBody?.error || data?.error || error.message;
      throw new Error(message || fallbackMessage);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function requestLessonRoleplay(action, lessonId, history) {
    if (!['chat', 'evaluate'].includes(action)) throw new Error('That roleplay action is not valid.');
    return invokeLessonFunction('lesson-roleplay', { action, lessonId: Number(lessonId), history },
      'The roleplay service could not respond. Please try again.');
  }

  // The index maps the survey's stable choice key to the existing lesson ID.
  const lessonPriorityKeys = [
    'confidence', 'conversations', 'interest-and-boundaries',
    'asking-someone-out', 'date-planning', 'following-up'
  ];
  const defaultLessonOrder = lessonPriorityKeys.map((_, index) => index + 1);

  function isLessonOrder(order) {
    return Array.isArray(order) && order.length === defaultLessonOrder.length &&
      defaultLessonOrder.every(id => order.includes(id));
  }

  function getLessonOrder(survey) {
    if (isLessonOrder(survey?.acceptedLessonOrder)) return survey.acceptedLessonOrder;
    const priorities = survey?.lessonPriorities;
    if (!Array.isArray(priorities) || priorities.length !== defaultLessonOrder.length) return defaultLessonOrder;
    const order = priorities.map(key => lessonPriorityKeys.indexOf(key) + 1);
    return order.includes(0) || new Set(order).size !== order.length ? defaultLessonOrder : order;
  }

  async function suggestLessonOrder(authUserId) {
    if ((await currentSessionUser()).id !== authUserId) throw new Error('Your login changed. Reload the Lessons page.');
    const fallback = 'A lesson order could not be suggested. Try again.';
    // Allow for the survey lookup, up to 30 seconds for Gemini, and network overhead.
    const suggestion = await waitForResponse(
      invokeLessonFunction('suggest-lesson-order', {}, fallback), 'Suggesting a lesson order', 40000
    );
    if ((await currentSessionUser()).id !== authUserId) throw new Error('Your login changed. Reload the Lessons page.');
    if (!isLessonOrder(suggestion?.lessonIds) || typeof suggestion.reason !== 'string' ||
        !suggestion.reason.trim() || typeof suggestion.surveyCompletedAt !== 'string') throw new Error(fallback);
    return suggestion;
  }

  async function acceptLessonOrder(suggestion, authUserId) {
    if (!isLessonOrder(suggestion?.lessonIds) || typeof suggestion.surveyCompletedAt !== 'string') {
      throw new Error('Request a new lesson order before saving.');
    }
    if ((await currentSessionUser()).id !== authUserId) throw new Error('Your login changed. Reload the Lessons page.');
    return rpc('beanos_accept_lesson_order', {
      p_order: suggestion.lessonIds,
      p_survey_completed_at: suggestion.surveyCompletedAt
    });
  }

  function readLessonTaskState(storageKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch { return {}; }
  }

  function lessonTaskProgress(saved, lessonOrder) {
    const completedTasks = saved && typeof saved.completedTasks === 'object' && saved.completedTasks ? saved.completedTasks : {};
    const starsByLesson = {};
    const completedTaskIdsByLesson = {};
    for (const lessonId of defaultLessonOrder) {
      const tasks = completedTasks[lessonId] && typeof completedTasks[lessonId] === 'object' ? completedTasks[lessonId] : {};
      const entries = Object.entries(tasks).filter(([, difficulty]) => Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5);
      completedTaskIdsByLesson[lessonId] = entries.map(([taskId]) => taskId);
      starsByLesson[lessonId] = entries.reduce((sum, [, difficulty]) => sum + difficulty, 0);
    }
    const completedLessons = lessonOrder.filter(id => starsByLesson[id] >= 10);
    const nextIndex = lessonOrder.findIndex(id => starsByLesson[id] < 10);
    const unlocked = new Set(lessonOrder.slice(0, nextIndex < 0 ? lessonOrder.length : nextIndex + 1));
    const previouslyUnlocked = saved.unlockedLessonIds;
    if (Array.isArray(previouslyUnlocked)) {
      for (const id of previouslyUnlocked) if (defaultLessonOrder.includes(id)) unlocked.add(id);
    } else if (defaultLessonOrder.some(id => starsByLesson[id] > 0)) {
      // Restore access earned under the original numeric sequence once per browser.
      const firstIncomplete = defaultLessonOrder.findIndex(id => starsByLesson[id] < 10);
      const legacyUnlocked = firstIncomplete < 0 ? defaultLessonOrder : defaultLessonOrder.slice(0, firstIncomplete + 1);
      for (const id of legacyUnlocked) unlocked.add(id);
    }
    for (const id of defaultLessonOrder) if (starsByLesson[id] > 0) unlocked.add(id);
    return {
      lessonOrder,
      completedLessons,
      completedTaskIdsByLesson,
      starsByLesson,
      nextLessonId: lessonOrder[nextIndex] ?? null,
      unlockedLessonIds: lessonOrder.filter(id => unlocked.has(id))
    };
  }

  async function loadLessonProgress(expectedUserId, survey) {
    const user = expectedUserId ? await currentSessionUser() : await currentUser();
    if (expectedUserId && user.id !== expectedUserId) throw new Error('Your login changed. Return to the lesson using your current account.');
    const answers = survey === undefined ? await rpc('beanos_get_survey') : survey;
    if ((await currentSessionUser()).id !== user.id) throw new Error('Your login changed. Return to the lesson using your current account.');
    const storageKey = `beanos_lesson_tasks:${user.id}`;
    const saved = readLessonTaskState(storageKey);
    const progress = lessonTaskProgress(saved, getLessonOrder(answers));
    if (JSON.stringify(saved.unlockedLessonIds) !== JSON.stringify(progress.unlockedLessonIds)) {
      localStorage.setItem(storageKey, JSON.stringify({ ...saved, unlockedLessonIds: progress.unlockedLessonIds }));
    }
    return progress;
  }

  async function completeLessonTask(lessonId, task, assignmentId, expectedUserId) {
    if (!Number.isInteger(lessonId) || lessonId < 1 || lessonId > 6) {
      throw new Error('That lesson number is not valid.');
    }
    const taskId = String(task?.id ?? '');
    const difficulty = Number(task?.difficulty);
    if (!taskId || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
      throw new Error('That task is missing a valid difficulty.');
    }
    const user = await currentUser();
    if (expectedUserId && user.id !== expectedUserId) throw new Error('Your login changed. Return to the lesson using your current account.');
    if (!assignmentId) throw new Error('The task assignment could not be verified. Return to the task list and try again.');
    const recorded = await rpc('beanos_complete_assigned_lesson_task', {
      p_assignment_id: assignmentId,
      p_task_id: Number(taskId)
    });
    if (!recorded) throw new Error('This task was not part of the current assignment. Return to the task list and try again.');
    if ((await currentSessionUser()).id !== user.id) throw new Error('Your login changed. Return to the lesson using your current account.');
    const answers = await rpc('beanos_get_survey');
    if ((await currentSessionUser()).id !== user.id) throw new Error('Your login changed. Return to the lesson using your current account.');
    const lessonOrder = getLessonOrder(answers);
    const storageKey = `beanos_lesson_tasks:${user.id}`;
    const saved = readLessonTaskState(storageKey);
    const progress = lessonTaskProgress(saved, lessonOrder);
    if (!progress.unlockedLessonIds.includes(lessonId)) {
      throw new Error('Complete tasks for the available lesson before opening this lesson.');
    }
    if (progress.starsByLesson[lessonId] >= 10) {
      const lessonTasks = await loadLessonTasks(lessonId);
      await addCurrentTasks(lessonTasks.map(item => item.id));
      return progress;
    }
    if (!saved.completedTasks || typeof saved.completedTasks !== 'object') saved.completedTasks = {};
    saved.completedTasks[lessonId] = saved.completedTasks[lessonId] || {};
    if (!saved.completedTasks[lessonId][taskId]) saved.completedTasks[lessonId][taskId] = difficulty;
    saved.unlockedLessonIds = progress.unlockedLessonIds;
    const updated = lessonTaskProgress(saved, lessonOrder);
    saved.unlockedLessonIds = updated.unlockedLessonIds;
    if (updated.starsByLesson[lessonId] >= 10) {
      const lessonTasks = await loadLessonTasks(lessonId);
      await addCurrentTasks(lessonTasks.map(item => item.id));
    }
    // Assignment and global completion records are saved through Supabase above;
    // this browser copy still drives lesson unlock progress.
    localStorage.setItem(storageKey, JSON.stringify(saved));
    return updated;
  }

  window.BeanosAPI = Object.freeze({
    get client() { return ready(); }, callbackUrl, explain, currentUser,
    requireAccount, destination, signOut,
    goHome: () => window.location.assign('index.html'),
    loadSurvey: () => rpc('beanos_get_survey'),
    // Ownership comes exclusively from auth.uid() inside the database function.
    saveSurvey: answers => rpc('beanos_save_survey', { p_answers: answers }),
    loadLessonResources,
    loadLessonRoleplayConfig,
    loadLessonTasks,
    loadCurrentTaskIds,
    addCurrentTasks,
    removeCurrentTask,
    startLessonTaskAssignment,
    requestLessonRoleplay,
    suggestLessonOrder,
    acceptLessonOrder,
    loadLessonProgress,
    completeLessonTask
  });
})();
