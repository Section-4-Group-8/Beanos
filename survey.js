(() => {
  'use strict';

  // Keep wording aligned with docs/survey-questions.md. IDs are stable for future saving.
  const questions = [
    {
      id: 'experience',
      title: 'Which best describes your dating experience?',
      options: [
        ['no-dates', 'I haven’t been on a date yet.'],
        ['dates-no-relationship', 'I’ve been on dates but haven’t been in a relationship.'],
        ['relationship-experience', 'I’ve been in one or more relationships.'],
        ['prefer-not-to-answer', 'I’d prefer not to answer.']
      ]
    },
    {
      id: 'conversationStyle',
      title: 'How do you usually approach conversations with someone new?',
      options: [
        ['start', 'I usually start the conversation.'],
        ['wait', 'I usually wait for the other person to start.'],
        ['keep-to-myself', 'I usually keep to myself.'],
        ['depends', 'My approach varies a lot depending on the situation.']
      ]
    },
    {
      id: 'comfort',
      title: 'How comfortable do you feel starting a conversation with someone you’re attracted to?',
      options: [
        ['very-uncomfortable', 'Very uncomfortable.'],
        ['somewhat-uncomfortable', 'Somewhat uncomfortable.'],
        ['neutral', 'Neither comfortable nor uncomfortable.'],
        ['somewhat-comfortable', 'Somewhat comfortable.'],
        ['very-comfortable', 'Very comfortable.'],
        ['unsure', 'I’m not sure yet.']
      ]
    }
  ];

  const skills = [
    ['start-conversation', 'Starting a conversation.'],
    ['keep-conversation', 'Keeping a conversation going.'],
    ['follow-up-questions', 'Asking thoughtful follow-up questions.'],
    ['share-about-myself', 'Sharing things about myself.'],
    ['express-interest', 'Expressing romantic interest respectfully.'],
    ['ask-on-date', 'Asking someone on a date.'],
    ['plan-date', 'Planning a date.'],
    ['comfortable-on-date', 'Feeling comfortable during a date.'],
    ['follow-up-after-date', 'Following up after a date.'],
    ['handle-rejection', 'Handling rejection.'],
    ['communicate-boundaries', 'Communicating my boundaries.'],
    ['check-mutual-interest', 'Checking whether interest is mutual.']
  ];

  const goals = [
    ['conversation-confidence', 'Feel more confident talking to someone I’m interested in.', '✦'],
    ['ask-on-date', 'Ask someone on a date.', '↗'],
    ['comfortable-first-dates', 'Feel more comfortable on first dates.', '☼'],
    ['connection-beyond-first-date', 'Build a connection beyond the first date.', '∞'],
    ['find-girlfriend', 'Work toward finding a girlfriend.', '♡'],
    ['return-to-dating', 'Get back into dating after a break.', '↻'],
    ['find-starting-point', 'Figure out where to start.', '⌁']
  ];

  const lessons = [
    ['confidence', 'Building confidence and handling nerves.'],
    ['conversations', 'Starting and continuing conversations.'],
    ['interest-and-boundaries', 'Showing interest and respecting boundaries.'],
    ['asking-someone-out', 'Asking someone on a date.'],
    ['date-planning', 'Planning and enjoying a date.'],
    ['following-up', 'Following up after a date.']
  ];

  // In-memory only: no accounts, browser storage, database calls, or redirects.
  const answers = {
    schemaVersion: 1,
    background: { experience: null, conversationStyle: null, comfort: null },
    skills: { strengths: [], practice: [] },
    mainGoal: null,
    lessonPriorities: lessons.map(([id]) => id),
    completedAt: null
  };

  const form = document.getElementById('survey-form');
  const screens = [...document.querySelectorAll('.survey-screen')];
  const nextButton = document.getElementById('next-button');
  const skillFeedback = document.getElementById('skill-feedback');
  const skillLabels = new Map(skills);
  const lessonLabels = new Map(lessons);
  let currentStep = 0;
  let selectedSkill = null;
  let draggedItem = null;
  let pointerDrag = null;
  let dragPreview = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function makeRadio(name, id, text, icon) {
    const label = element('label', 'answer-option');
    const input = element('input');
    input.type = 'radio';
    input.name = name;
    input.value = id;
    input.required = true;
    label.append(input);
    if (icon) {
      const glyph = element('span', 'goal-icon', icon);
      glyph.setAttribute('aria-hidden', 'true');
      label.append(glyph);
    }
    label.append(element('span', '', text));
    return label;
  }

  function renderQuestions() {
    const container = document.getElementById('background-questions');
    questions.forEach((question, index) => {
      const fieldset = element('fieldset', 'question');
      const legend = element('legend');
      const number = element('span', 'question-number', `0${index + 1}`);
      number.setAttribute('aria-hidden', 'true');
      legend.append(number, document.createTextNode(question.title));
      const grid = element('div', 'answer-grid');
      question.options.forEach(([id, text]) => grid.append(makeRadio(question.id, id, text)));
      fieldset.append(legend, grid);
      container.append(fieldset);
    });
    goals.forEach(([id, text, icon]) => {
      document.getElementById('goal-options').append(makeRadio('mainGoal', id, text, icon));
    });
  }

  function skillZone(id) {
    if (answers.skills.strengths.includes(id)) return 'strengths';
    if (answers.skills.practice.includes(id)) return 'practice';
    return 'bank';
  }

  function placedCount() {
    return answers.skills.strengths.length + answers.skills.practice.length;
  }

  function updateSkillSelection() {
    document.querySelectorAll('[data-skill]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.skill === selectedSkill));
    });
    document.querySelectorAll('[data-place], [data-place-mobile]').forEach(button => {
      button.disabled = !selectedSkill ||
        (placedCount() === 6 && skillZone(selectedSkill) === 'bank') ||
        skillZone(selectedSkill) === (button.dataset.place || button.dataset.placeMobile);
    });
    document.getElementById('mobile-placement').hidden = !selectedSkill || currentStep !== 1;
    document.getElementById('mobile-selected-label').textContent = skillLabels.get(selectedSkill) || '';
  }

  function renderSkills() {
    const lists = {
      bank: document.getElementById('skill-bank'),
      strengths: document.getElementById('strengths-list'),
      practice: document.getElementById('practice-list')
    };
    Object.values(lists).forEach(list => list.replaceChildren());
    for (const [id, label] of skills) {
      const zone = skillZone(id);
      const item = element('div', 'skill-item');
      item.draggable = true;
      item.dataset.dragSkill = id;
      const button = element('button', 'skill-chip');
      const grip = element('span', 'skill-grip', '⠿');
      grip.setAttribute('aria-hidden', 'true');
      item.append(grip);
      button.append(document.createTextNode(label));
      button.type = 'button';
      button.dataset.skill = id;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `Select ${label}`);
      item.append(button);
      if (zone !== 'bank') {
        const remove = element('button', 'skill-remove', '×');
        remove.type = 'button';
        remove.dataset.removeSkill = id;
        remove.setAttribute('aria-label', `Remove ${label}`);
        item.append(remove);
      }
      lists[zone].append(item);
    }
    for (const zone of ['strengths', 'practice']) {
      const count = answers.skills[zone].length;
      document.getElementById(`${zone}-count`).textContent = count;
      if (!count) lists[zone].append(element('p', 'empty-list', 'Drop an action here, or use the button above.'));
    }
    document.getElementById('skills-count').textContent = `${placedCount()} / 6 placed`;
    updateSkillSelection();
    updateNavigation();
  }

  function focusSkill(id) {
    document.querySelector(`[data-skill="${id}"]`)?.focus();
  }

  function placeSkill(id, destination) {
    if (!skillLabels.has(id) || !['bank', 'strengths', 'practice'].includes(destination)) return;
    const source = skillZone(id);
    if (source === 'bank' && destination !== 'bank' && placedCount() >= 6) {
      skillFeedback.textContent = 'You’ve placed six actions. Remove one before adding another.';
      return;
    }
    answers.skills.strengths = answers.skills.strengths.filter(value => value !== id);
    answers.skills.practice = answers.skills.practice.filter(value => value !== id);
    if (destination !== 'bank') answers.skills[destination].push(id);
    answers.completedAt = null;
    selectedSkill = null;
    renderSkills();
    const destinationLabel = { bank: 'the action bank', strengths: 'Strengths', practice: 'Want to practice' }[destination];
    skillFeedback.textContent = `${skillLabels.get(id)} Moved to ${destinationLabel}. ${placedCount()} of 6 actions placed.`;
    focusSkill(id);
  }

  function renderLessons(focusId, direction) {
    const list = document.getElementById('lesson-list');
    list.replaceChildren();
    answers.lessonPriorities.forEach((id, index) => {
      const item = element('li', 'lesson-item');
      item.dataset.lesson = id;
      item.draggable = true;
      const grip = element('span', 'lesson-grip', '⠿');
      const number = element('span', 'lesson-number', String(index + 1).padStart(2, '0'));
      grip.setAttribute('aria-hidden', 'true');
      number.setAttribute('aria-hidden', 'true');
      item.append(grip, number, element('span', 'lesson-label', lessonLabels.get(id)));
      const controls = element('div', 'lesson-controls');
      for (const [move, glyph] of [['up', '↑'], ['down', '↓']]) {
        const button = element('button', '', glyph);
        button.type = 'button';
        button.dataset.moveLesson = id;
        button.dataset.direction = move;
        button.setAttribute('aria-label', `Move ${lessonLabels.get(id)} ${move}`);
        button.disabled = (move === 'up' && index === 0) || (move === 'down' && index === lessons.length - 1);
        controls.append(button);
      }
      item.append(controls);
      list.append(item);
    });
    if (focusId) {
      const item = list.querySelector(`[data-lesson="${focusId}"]`);
      const preferred = item.querySelector(`[data-direction="${direction}"]:not(:disabled)`);
      (preferred || item.querySelector('button:not(:disabled)')).focus();
    }
  }

  function moveLesson(id, targetIndex, direction) {
    const oldIndex = answers.lessonPriorities.indexOf(id);
    if (oldIndex < 0 || targetIndex < 0 || targetIndex >= lessons.length || oldIndex === targetIndex) return;
    answers.lessonPriorities.splice(oldIndex, 1);
    answers.lessonPriorities.splice(targetIndex, 0, id);
    answers.completedAt = null;
    renderLessons(id, direction);
    document.getElementById('ranking-feedback').textContent = `${lessonLabels.get(id)} Moved to position ${targetIndex + 1} of ${lessons.length}.`;
  }

  function stepIsComplete(step) {
    if (step === 0) return questions.every(question => question.options.some(([id]) => id === answers.background[question.id]));
    if (step === 1) return placedCount() === 6;
    if (step === 2) return goals.some(([id]) => id === answers.mainGoal);
    if (step === 3) return answers.lessonPriorities.length === lessons.length && new Set(answers.lessonPriorities).size === lessons.length && answers.lessonPriorities.every(id => lessonLabels.has(id));
    return true;
  }

  function updateNavigation() {
    nextButton.disabled = !stepIsComplete(currentStep);
    document.getElementById('back-button').hidden = currentStep === 0;
    document.getElementById('first-step-note').hidden = currentStep !== 0;
    document.getElementById('next-label').textContent = currentStep === 3 ? 'Finish survey' : 'Continue';
    const answered = Object.values(answers.background).filter(Boolean).length;
    const hints = [
      answered === 3 ? 'All three answered. Ready when you are.' : `${answered} of 3 answered. Answer all three to continue.`,
      placedCount() === 6 ? 'Six actions placed. Ready to continue.' : `${placedCount()} of 6 actions placed. Choose six in total to continue.`,
      answers.mainGoal ? 'Goal selected. Ready to continue.' : 'Choose one main goal to continue.',
      'Reorder the topics, or keep this order and finish.'
    ];
    document.getElementById('continue-hint').textContent = hints[currentStep] || '';
  }

  function showStep(step, focusHeading = true) {
    currentStep = Math.max(0, Math.min(step, 4));
    screens.forEach(screen => { screen.hidden = Number(screen.dataset.step) !== currentStep; });
    document.getElementById('survey-footer').hidden = currentStep === 4;
    document.querySelectorAll('#step-list li').forEach((item, index) => {
      item.classList.toggle('is-complete', index < currentStep);
      if (index === currentStep) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      item.querySelector('.step-number').textContent = index < currentStep ? '✓' : String(index + 1).padStart(2, '0');
    });
    const percent = currentStep * 25;
    document.getElementById('progress-label').textContent = currentStep === 4 ? 'Survey complete' : `Step ${currentStep + 1} of 4`;
    document.getElementById('progress-percent').textContent = `${percent}% complete`;
    document.getElementById('survey-progress').setAttribute('aria-valuenow', percent);
    document.getElementById('progress-fill').style.width = `${percent}%`;
    document.title = currentStep === 4 ? 'Survey complete | Beanos' : `${['About you', 'Your skills', 'Your goal', 'Your priorities'][currentStep]} | Beanos`;
    updateNavigation();
    updateSkillSelection();
    if (focusHeading) screens[currentStep].querySelector('h1').focus();
  }

  function getAnswers() {
    // Return a copy, so future saving code cannot accidentally change the survey state.
    return JSON.parse(JSON.stringify(answers));
  }

  form.addEventListener('change', event => {
    const input = event.target;
    if (!input.matches('input[type="radio"]')) return;
    if (Object.hasOwn(answers.background, input.name)) answers.background[input.name] = input.value;
    else if (input.name === 'mainGoal') answers.mainGoal = input.value;
    answers.completedAt = null;
    updateNavigation();
  });

  form.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-skill]');
    if (remove) return placeSkill(remove.dataset.removeSkill, 'bank');
    const skill = event.target.closest('[data-skill]');
    if (skill) {
      selectedSkill = selectedSkill === skill.dataset.skill ? null : skill.dataset.skill;
      updateSkillSelection();
      skillFeedback.textContent = selectedSkill
        ? (placedCount() === 6 && skillZone(selectedSkill) === 'bank'
          ? 'You’ve placed six actions. Remove one before adding another.'
          : `${skillLabels.get(selectedSkill)} Selected. Choose a column above its action list.`)
        : 'Selection cleared. Select an action to place it.';
      return;
    }
    const place = event.target.closest('[data-place], [data-place-mobile]');
    if (place && selectedSkill) return placeSkill(selectedSkill, place.dataset.place || place.dataset.placeMobile);
    const move = event.target.closest('[data-move-lesson]');
    if (move) {
      const index = answers.lessonPriorities.indexOf(move.dataset.moveLesson);
      moveLesson(move.dataset.moveLesson, index + (move.dataset.direction === 'up' ? -1 : 1), move.dataset.direction);
    }
  });

  function clearDrag() {
    draggedItem = null;
    pointerDrag = null;
    dragPreview?.remove();
    dragPreview = null;
    document.querySelectorAll('.dragging, .drag-over').forEach(node => node.classList.remove('dragging', 'drag-over'));
  }

  function dropItemAt(item, node, clientY) {
    if (!node) return;
    if (item.type === 'skill') {
      const zone = node.closest('[data-zone]');
      if (zone) placeSkill(item.id, zone.dataset.zone);
    } else {
      const target = node.closest('[data-lesson]');
      if (target && target.dataset.lesson !== item.id) {
        const rect = target.getBoundingClientRect();
        const remaining = answers.lessonPriorities.filter(id => id !== item.id);
        const index = remaining.indexOf(target.dataset.lesson) + (clientY > rect.top + rect.height / 2 ? 1 : 0);
        moveLesson(item.id, index);
      }
    }
  }

  // Pointer handles also support touch and browsers without native HTML drag-and-drop.
  form.addEventListener('pointerdown', event => {
    const handle = event.target.closest('.skill-grip, .lesson-grip');
    if (!handle || event.button !== 0) return;
    const skill = handle.closest('[data-drag-skill]');
    const lesson = handle.closest('[data-lesson]');
    if (!skill && !lesson) return;
    event.preventDefault();
    form.setPointerCapture(event.pointerId);
    pointerDrag = {
      type: skill ? 'skill' : 'lesson',
      id: skill ? skill.dataset.dragSkill : lesson.dataset.lesson,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      source: skill || lesson,
      active: false
    };
  });

  form.addEventListener('pointermove', event => {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    if (!pointerDrag.active) {
      if (Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY) < 6) return;
      pointerDrag.active = true;
      pointerDrag.source.classList.add('dragging');
      dragPreview = element('div', 'drag-preview', (pointerDrag.type === 'skill' ? skillLabels : lessonLabels).get(pointerDrag.id));
      dragPreview.setAttribute('aria-hidden', 'true');
      document.body.append(dragPreview);
    }
    dragPreview.style.left = `${Math.min(event.clientX + 12, window.innerWidth - 250)}px`;
    dragPreview.style.top = `${event.clientY + 12}px`;
    const selector = pointerDrag.type === 'skill' ? '[data-zone]' : '[data-lesson]';
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(selector);
    document.querySelectorAll('.drag-over').forEach(node => { if (node !== target) node.classList.remove('drag-over'); });
    target?.classList.add('drag-over');
    if (event.clientY < 55) window.scrollBy(0, -14);
    else if (event.clientY > window.innerHeight - 55) window.scrollBy(0, 14);
  });

  form.addEventListener('pointerup', event => {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const item = pointerDrag;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (form.hasPointerCapture(event.pointerId)) form.releasePointerCapture(event.pointerId);
    clearDrag();
    if (item.active) dropItemAt(item, target, event.clientY);
  });
  form.addEventListener('pointercancel', clearDrag);

  form.addEventListener('dragstart', event => {
    const skill = event.target.closest('[data-drag-skill]');
    const lesson = event.target.closest('[data-lesson]');
    if (!skill && !lesson) return;
    draggedItem = skill ? { type: 'skill', id: skill.dataset.dragSkill } : { type: 'lesson', id: lesson.dataset.lesson };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedItem.id);
    (skill || lesson).classList.add('dragging');
  });

  form.addEventListener('dragover', event => {
    if (!draggedItem) return;
    const target = event.target.closest(draggedItem.type === 'skill' ? '[data-zone]' : '[data-lesson]');
    if (!target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.drag-over').forEach(node => { if (node !== target) node.classList.remove('drag-over'); });
    target.classList.add('drag-over');
  });

  form.addEventListener('dragleave', event => {
    const target = event.target.closest('.drag-over');
    if (target && !target.contains(event.relatedTarget)) target.classList.remove('drag-over');
  });

  form.addEventListener('drop', event => {
    if (!draggedItem) return;
    event.preventDefault();
    dropItemAt(draggedItem, event.target, event.clientY);
    clearDrag();
  });
  form.addEventListener('dragend', clearDrag);

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (currentStep >= 4 || !stepIsComplete(currentStep)) return;
    if (currentStep === 3) {
      const incompleteStep = [0, 1, 2, 3].find(step => !stepIsComplete(step));
      if (incompleteStep !== undefined) return showStep(incompleteStep);
      answers.completedAt = new Date().toISOString();
      document.getElementById('complete-goal').textContent = goals.find(([id]) => id === answers.mainGoal)[1];
      document.getElementById('complete-priority').textContent = lessonLabels.get(answers.lessonPriorities[0]);
      // Future Supabase integration can listen here. No saving is performed now.
      document.dispatchEvent(new CustomEvent('beanos:survey-completed', { detail: getAnswers() }));
    }
    showStep(currentStep + 1);
  });

  document.getElementById('back-button').addEventListener('click', () => showStep(currentStep - 1));
  document.getElementById('clear-skill-selection').addEventListener('click', () => {
    const previous = selectedSkill;
    selectedSkill = null;
    updateSkillSelection();
    skillFeedback.textContent = 'Selection cleared. Select an action to place it.';
    if (previous) focusSkill(previous);
  });
  document.getElementById('review-answers').addEventListener('click', () => showStep(0));
  window.BeanosSurvey = Object.freeze({ getAnswers });

  renderQuestions();
  renderSkills();
  renderLessons();
  showStep(0, false);
  form.hidden = false;
})();
