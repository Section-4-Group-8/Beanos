(() => {
  'use strict';

  const lessons = [
    'Building confidence and handling nerves',
    'Starting and continuing conversations',
    'Showing interest and respecting boundaries',
    'Asking someone on a date',
    'Planning and enjoying a date',
    'Following up after a date'
  ];
  const cards = document.getElementById('lesson-cards');
  const status = document.getElementById('lesson-list-status');

  function render(progress) {
    cards.replaceChildren();
    const completed = new Set(progress.completedLessons);
    const unlockedLessons = new Set(progress.unlockedLessonIds);
    for (const lessonId of progress.lessonOrder) {
      const title = lessons[lessonId - 1];
      const unlocked = unlockedLessons.has(lessonId);
      const isComplete = completed.has(lessonId);
      const card = document.createElement(unlocked ? 'a' : 'div');
      card.className = `lesson-page-card${unlocked ? '' : ' locked'}`;
      if (unlocked) card.href = `beanos_lesson_template.html?lesson=${lessonId}`;
      else card.setAttribute('aria-disabled', 'true');

      const number = document.createElement('span');
      number.className = 'lesson-choice-number';
      number.textContent = `LESSON ${String(lessonId).padStart(2, '0')}`;
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
          : `Locked · Continue with Lesson ${progress.nextLessonId} on your path`;
      const arrow = document.createElement('span');
      arrow.className = 'lesson-page-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = isComplete ? '✓' : unlocked ? '→' : '•';
      card.append(number, name, detail);
      if (unlocked && !isComplete) {
        const meter = document.createElement('span');
        meter.className = 'lesson-unlock-meter';
        meter.setAttribute('role', 'progressbar');
        meter.setAttribute('aria-label', `Progress toward completing Lesson ${lessonId}`);
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
      ? `Lesson ${progress.nextLessonId} is your next available lesson.`
      : 'You’ve completed all six lessons. You can revisit any lesson below.';
  }

  async function initialize() {
    try {
      const account = await window.BeanosAPI.requireAccount({ completed: true });
      if (!account) return;
      render(await window.BeanosAPI.loadLessonProgress(account.authUserId));
    } catch (error) {
      status.textContent = window.BeanosAPI?.explain(error) || 'Your lesson progress could not load. Please return home and try again.';
    }
  }

  initialize();
})();
