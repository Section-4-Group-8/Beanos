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
  const tasksLink = document.getElementById('home-tasks-link');
  const dailyTaskCard = document.getElementById('daily-task-card');
  const dailyTaskStatus = document.getElementById('daily-task-status');
  const lessons = [
    ['Building confidence and handling nerves', 'confidence'],
    ['Texting and keeping conversations flowing', 'conversations'],
    ['Handling rejection with self-respect', 'interest-and-boundaries'],
    ['Personal style and grooming', 'asking-someone-out'],
    ['Asking someone out and planning a date', 'date-planning'],
    ['How to have good dates', 'following-up']
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

  function renderTaskAccess(progress) {
    const hasCompletedLesson = Array.isArray(progress?.completedLessons) && progress.completedLessons.length > 0;
    if (!hasCompletedLesson) {
      tasksLink.removeAttribute('href');
      tasksLink.setAttribute('aria-disabled', 'true');
      tasksLink.setAttribute('tabindex', '-1');
      tasksLink.classList.add('is-locked');
      tasksLink.textContent = 'Complete Lesson 1 to unlock tasks';
      return;
    }
    tasksLink.href = 'tasks.html';
    tasksLink.removeAttribute('aria-disabled');
    tasksLink.removeAttribute('tabindex');
    tasksLink.classList.remove('is-locked');
    tasksLink.innerHTML = 'Go to tasks <span aria-hidden="true">→</span>';
  }
  function selectDailyTask(tasks, authUserId) {
    if (!tasks.length) return null;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const storageKey = `beanos.daily-task:${authUserId}:${today}`;
    try {
      const savedId = localStorage.getItem(storageKey);
      const savedTask = tasks.find(task => String(task.id) === savedId);
      if (savedTask) return savedTask;
    } catch { /* A storage restriction should not prevent a daily task from appearing. */ }
    const selected = tasks[Math.floor(Math.random() * tasks.length)];
    try { localStorage.setItem(storageKey, String(selected.id)); } catch { /* Use the in-memory choice for this visit. */ }
    return selected;
  }

  async function renderDailyTask(progress, authUserId) {
    const completedLessonIds = (progress?.lessonOrder || []).map(Number)
      .filter(id => (progress.completedLessons || []).map(Number).includes(id));
    if (!completedLessonIds.length) {
      dailyTaskCard.hidden = true;
      return;
    }
    dailyTaskCard.hidden = false;
    dailyTaskStatus.hidden = true;
    try {
      const { data:taskRows, error:taskError } = await api.client.from('task_bank')
        .select('id,lesson_id,difficulty,title,description,estimated_minutes')
        .in('lesson_id', completedLessonIds);
      if (taskError) throw taskError;
      const { data:completionRows, error:completionError } = await api.client.from('task_completions')
        .select('task_id')
        .eq('auth_user_id', authUserId)
        .eq('completed', true);
      if (completionError) throw completionError;
      const completedTaskIds = new Set((completionRows || []).map(row => String(row.task_id)));
      const availableTasks = (taskRows || []).filter(task => !completedTaskIds.has(String(task.id)));
      const task = selectDailyTask(availableTasks, authUserId);
      if (!task) {
        const noTasksLinked = !(taskRows || []).length;
        document.getElementById('daily-task-title').textContent = noTasksLinked ? 'No tasks are linked yet' : 'You’ve completed every available task';
        document.getElementById('daily-task-description').textContent = noTasksLinked
          ? 'Tasks for your completed lessons will appear here when they are added to the task bank.'
          : 'Complete another lesson to unlock more tasks for your daily practice.';
        document.getElementById('daily-task-difficulty').textContent = '';
        document.getElementById('daily-task-estimate').textContent = '';
        document.getElementById('daily-task-lesson').textContent = '';
        document.getElementById('daily-task-link').hidden = true;
        return;
      }
      document.getElementById('daily-task-title').textContent = task.title;
      document.getElementById('daily-task-description').textContent = task.description || '';
      document.getElementById('daily-task-difficulty').textContent = `${'★'.repeat(Number(task.difficulty) || 0)}${'☆'.repeat(Math.max(0, 5 - (Number(task.difficulty) || 0)))} · ${task.difficulty}-star difficulty`;
      document.getElementById('daily-task-estimate').textContent = Number(task.estimated_minutes) ? `About ${task.estimated_minutes} minutes` : 'Go at your own pace';
      document.getElementById('daily-task-lesson').textContent = `Lesson ${task.lesson_id}`;
      const taskLink = document.getElementById('daily-task-link');
      taskLink.href = `tasks.html?task_id=${encodeURIComponent(String(task.id))}`;
      taskLink.hidden = false;
    } catch (error) {
      dailyTaskStatus.textContent = api?.explain(error) || 'Today’s task could not load. Please try again later.';
      dailyTaskStatus.hidden = false;
      document.getElementById('daily-task-link').hidden = true;
      console.error('Could not load the daily task:', error);
    }
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
      let survey;
      try {
        survey = await api.loadSurvey();
        document.getElementById('home-goal').textContent = goals.get(survey?.mainGoal) || 'Your next step, at your pace.';
      } catch {
        status.textContent = 'Your saved focus couldn’t load. You can still explore lessons and tasks.';
        status.hidden = false;
      }
      // A second tab can switch accounts while the survey request is in flight.
      if ((await api.currentUser()).id !== user.id) return loginChanged();
      lessonList.replaceChildren();
      if (survey !== undefined) {
        const lessonProgress = await api.loadLessonProgress(user.id, survey);
        renderLessons(lessonProgress.nextLessonId);
        renderTaskAccess(lessonProgress);
        await renderDailyTask(lessonProgress, user.id);
      }
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
