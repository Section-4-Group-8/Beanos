(() => {
  'use strict';

  const lessons = [
    'Building confidence and handling nerves',
    'Texting and keeping conversations flowing',
    'Handling rejection with self-respect',
    'Personal style and grooming',
    'Asking someone out and planning a date',
    'How to have good dates'
  ];
  const cards = document.getElementById('lesson-cards');
  const status = document.getElementById('lesson-list-status');
  const api = window.BeanosAPI;
  const suggestButton = document.getElementById('suggest-lesson-order');
  const acceptButton = document.getElementById('accept-lesson-order');
  const keepButton = document.getElementById('keep-lesson-order');
  const suggestionStatus = document.getElementById('suggestion-status');
  const preview = document.getElementById('lesson-order-preview');
  let authUserId;
  let suggestion;

  function render(progress) {
    cards.replaceChildren();
    const completed = new Set(progress.completedLessons);
    const unlockedLessons = new Set(progress.unlockedLessonIds);
    for (const lessonId of progress.lessonOrder) {
      const lessonNumber = api.getLessonNumber(lessonId, progress.lessonOrder);
      const title = lessons[lessonId - 1];
      const unlocked = unlockedLessons.has(lessonId);
      const isComplete = completed.has(lessonId);
      const card = document.createElement(unlocked ? 'a' : 'div');
      card.className = `lesson-page-card${unlocked ? '' : ' locked'}`;
      if (unlocked) card.href = `beanos_lesson_template.html?lesson=${lessonId}`;
      else card.setAttribute('aria-disabled', 'true');

      const number = document.createElement('span');
      number.className = 'lesson-choice-number';
      number.textContent = `LESSON ${String(lessonNumber).padStart(2, '0')}`;
      const name = document.createElement('span');
      name.className = 'lesson-choice-title';
      name.textContent = title;
      const detail = document.createElement('span');
      detail.className = 'lesson-page-detail';
      const stars = Number(progress.starsByLesson[lessonId]) || 0;
      detail.textContent = isComplete
        ? 'Completed · Available to revisit'
        : unlocked
          ? `Available now · ${stars} / 10 stars to complete`
          : `Locked · Continue with Lesson ${api.getLessonNumber(progress.nextLessonId, progress.lessonOrder)} on your path`;
      const arrow = document.createElement('span');
      arrow.className = 'lesson-page-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = isComplete ? '✓' : unlocked ? '→' : '•';
      card.append(number, name, detail);
      if (unlocked && !isComplete) {
        const meter = document.createElement('span');
        meter.className = 'lesson-unlock-meter';
        meter.setAttribute('role', 'progressbar');
        meter.setAttribute('aria-label', `Progress toward completing Lesson ${lessonNumber}`);
        meter.setAttribute('aria-valuemin', '0');
        meter.setAttribute('aria-valuemax', '10');
        meter.setAttribute('aria-valuenow', String(Math.min(10, stars)));
        const fill = document.createElement('span');
        fill.style.width = `${Math.min(100, stars * 10)}%`;
        meter.appendChild(fill);
        card.appendChild(meter);
      }
      card.appendChild(arrow);
      cards.appendChild(card);
    }
    status.textContent = progress.nextLessonId
      ? `Lesson ${api.getLessonNumber(progress.nextLessonId, progress.lessonOrder)} is your next available lesson.`
      : 'You’ve completed all six lessons. You can revisit any lesson below.';
  }

  async function initialize() {
    try {
      const account = await api.requireAccount({ completed: true });
      if (!account) return;
      authUserId = account.authUserId;
      render(await api.loadLessonProgress(authUserId));
      suggestButton.disabled = false;
    } catch (error) {
      status.textContent = window.BeanosAPI?.explain(error) || 'Your lesson progress could not load. Please return home and try again.';
    }
  }

  function closePreview(message) {
    suggestion = undefined;
    preview.hidden = true;
    suggestionStatus.textContent = message;
    suggestButton.disabled = false;
    suggestButton.focus();
  }

  suggestButton.addEventListener('click', async () => {
    suggestButton.disabled = true;
    suggestionStatus.textContent = 'Creating your suggested order…';
    try {
      suggestion = await api.suggestLessonOrder(authUserId);
      const items = suggestion.lessonIds.map(id => {
        const item = document.createElement('li');
        item.textContent = lessons[id - 1];
        return item;
      });
      document.getElementById('suggested-lessons').replaceChildren(...items);
      document.getElementById('lesson-order-reason').textContent = suggestion.reason;
      suggestionStatus.textContent = '';
      preview.hidden = false;
      document.getElementById('lesson-order-preview-title').focus();
    } catch (error) {
      closePreview(api.explain(error));
    }
  });

  keepButton.addEventListener('click', () => closePreview('Your current lesson order is still in use.'));

  acceptButton.addEventListener('click', async () => {
    if (!suggestion) return;
    acceptButton.disabled = true;
    keepButton.disabled = true;
    suggestionStatus.textContent = 'Saving your lesson order…';
    try {
      const saved = await api.acceptLessonOrder(suggestion, authUserId);
      closePreview('Your new lesson order is saved.');
      try {
        render(await api.loadLessonProgress(authUserId, saved));
      } catch {
        suggestionStatus.textContent = 'Your new order is saved. Reload Lessons to see it.';
      }
    } catch (error) {
      suggestionStatus.textContent = api.explain(error);
    } finally {
      acceptButton.disabled = false;
      keepButton.disabled = false;
    }
  });

  initialize();
})();
