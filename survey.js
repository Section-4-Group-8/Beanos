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

  // Edit in memory; save the completed survey through the signed-in account RPC.
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
  let currentSkill = null;
  let pointerDrag = null;
  let dragPreview = null;
  let scrollFrame = 0;
  let saving = false;
  let initialAuthId = null;
  let loginChanged = false;
  const api = window.BeanosAPI;
  const saveStatus = document.getElementById('survey-save-status');
  const skippedSkills = new Set();


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
    input.checked = (name === 'mainGoal' ? answers.mainGoal : answers.background[name]) === id;
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
      fieldset.hidden = index > 0 && !answers.background[questions[index - 1].id];
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

  function placedCount() {
    return answers.skills.strengths.length + answers.skills.practice.length;
  }

  function skillCard(id, destination) {
    const card = element('div', 'skill-item');
    card.dataset.dragSkill = id;
    const grip = element('span', 'skill-grip', '⠿');
    grip.setAttribute('aria-hidden', 'true');
    card.append(grip, element('span', 'skill-label', skillLabels.get(id)));
    if (destination) {
      const move = element('button', 'skill-move', 'Move');
      move.type = 'button';
      move.dataset.moveSkill = id;
      move.dataset.destination = destination;
      move.setAttribute('aria-label', `Move ${skillLabels.get(id)} to ${destination === 'strengths' ? 'Strengths' : 'Want to practice'}`);
      card.append(move);
    }
    return card;
  }

  function renderSkills() {
    const { strengths, practice } = answers.skills;
    currentSkill = skills.find(([id]) => !strengths.includes(id) && !practice.includes(id) && !skippedSkills.has(id))?.[0];
    const action = document.getElementById('current-action');
    action.replaceChildren(currentSkill
      ? skillCard(currentSkill)
      : element('p', 'empty-list', 'All actions reviewed.'));
    document.getElementById('skills-count').textContent = `${placedCount() + skippedSkills.size} / ${skills.length} reviewed`;
    document.getElementById('skip-skill').hidden = !currentSkill;
    document.getElementById('review-skipped').hidden = Boolean(currentSkill) || !skippedSkills.size;

    for (const zone of ['strengths', 'practice']) {
      const list = document.getElementById(`${zone}-list`);
      const otherZone = zone === 'strengths' ? 'practice' : 'strengths';
      list.replaceChildren(...answers.skills[zone].map(id => skillCard(id, otherZone)));
      if (!list.children.length) list.append(element('p', 'empty-list', 'Drop an action here.'));
      document.querySelector(`[data-place="${zone}"]`).disabled = !currentSkill;
    }
    updateNavigation();
  }

  function placeSkill(id, destination, focusTarget = false) {
    if (!skillLabels.has(id) || !Object.hasOwn(answers.skills, destination) ||
        answers.skills[destination].includes(id)) return;
    const isCurrent = id === currentSkill;
    if (!isCurrent && !Object.values(answers.skills).some(list => list.includes(id))) return;
    for (const zone of ['strengths', 'practice']) {
      answers.skills[zone] = answers.skills[zone].filter(value => value !== id);
    }
    answers.skills[destination].push(id);
    answers.completedAt = null;
    renderSkills();
    const label = destination === 'strengths' ? 'Strengths' : 'Want to practice';
    const nextAction = isCurrent && currentSkill ? ` Next action: ${skillLabels.get(currentSkill)}` : '';
    skillFeedback.textContent = `${skillLabels.get(id)} Placed under ${label}.${nextAction}`;
    if (focusTarget) {
      const target = isCurrent
        ? (currentSkill ? document.querySelector(`[data-place="${destination}"]`) : nextButton)
        : document.querySelector(`[data-move-skill="${id}"]`);
      target.focus({ preventScroll: Boolean(currentSkill) && isCurrent });
    }
  }

  function renderLessons(focusId, direction) {
    const list = document.getElementById('lesson-list');
    list.replaceChildren();
    answers.lessonPriorities.forEach((id, index) => {
      const item = element('li', 'lesson-item');
      item.dataset.lesson = id;
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
    renderLessons(direction ? id : null, direction);
    document.getElementById('ranking-feedback').textContent = `${lessonLabels.get(id)} Moved to position ${targetIndex + 1} of ${lessons.length}.`;
  }

  function stepIsComplete(step) {
    if (step === 0) return questions.every(question => question.options.some(([id]) => id === answers.background[question.id]));
    if (step === 1) return placedCount() + skippedSkills.size === skills.length;
    if (step === 2) return goals.some(([id]) => id === answers.mainGoal);
    if (step === 3) return answers.lessonPriorities.length === lessons.length && new Set(answers.lessonPriorities).size === lessons.length && answers.lessonPriorities.every(id => lessonLabels.has(id));
    return true;
  }

  function updateNavigation() {
    nextButton.disabled = saving || !stepIsComplete(currentStep);
    document.getElementById('back-button').disabled = saving;
    document.getElementById('back-button').hidden = currentStep === 0;
    document.getElementById('first-step-note').hidden = currentStep !== 0;
    document.getElementById('next-label').textContent = saving ? 'Saving…' : currentStep === 3 ? 'Finish survey' : 'Continue';
    const answered = Object.values(answers.background).filter(Boolean).length;
    const hints = [
      answered === 3 ? 'All three answered. Ready when you are.' : `${answered} of 3 answered. Answer all three to continue.`,
      stepIsComplete(1) ? 'All actions reviewed. Ready to continue.' : 'Place or skip each action to continue.',
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
    if (focusHeading) screens[currentStep].querySelector('h1').focus();
  }

  function getAnswers() {
    // Return a copy, so future saving code cannot accidentally change the survey state.
    return JSON.parse(JSON.stringify(answers));
  }

  form.addEventListener('change', event => {
    if (saving) return;
    const input = event.target;
    if (!input.matches('input[type="radio"]')) return;
    if (Object.hasOwn(answers.background, input.name)) {
      answers.background[input.name] = input.value;
      const nextQuestion = input.closest('.question').nextElementSibling;
      if (nextQuestion?.hidden) {
        nextQuestion.hidden = false;
        if (!input.matches(':focus-visible') && nextQuestion.querySelector('legend').scrollIntoView) {
          nextQuestion.querySelector('legend').scrollIntoView({ block: 'nearest' });
        }
      }
    } else if (input.name === 'mainGoal') answers.mainGoal = input.value;
    answers.completedAt = null;
    updateNavigation();
  });

  form.addEventListener('click', event => {
    if (saving) return;
    if (event.target.closest('#skip-skill') && currentSkill) {
      skippedSkills.add(currentSkill);
      renderSkills();
      skillFeedback.textContent = currentSkill ? `Skipped. Next action: ${skillLabels.get(currentSkill)}` : 'All actions reviewed.';
      if (!currentSkill) nextButton.focus();
      return;
    }
    if (event.target.closest('#review-skipped')) {
      skippedSkills.clear();
      renderSkills();
      document.getElementById('skip-skill').focus();
      skillFeedback.textContent = `Next action: ${skillLabels.get(currentSkill)}`;
      return;
    }
    const place = event.target.closest('[data-place]');
    if (place && currentSkill) return placeSkill(currentSkill, place.dataset.place, true);
    const moveSkill = event.target.closest('[data-move-skill]');
    if (moveSkill) return placeSkill(moveSkill.dataset.moveSkill, moveSkill.dataset.destination, true);
    const move = event.target.closest('[data-move-lesson]');
    if (move) {
      const index = answers.lessonPriorities.indexOf(move.dataset.moveLesson);
      moveLesson(move.dataset.moveLesson, index + (move.dataset.direction === 'up' ? -1 : 1), move.dataset.direction);
    }
  });

  function clearDrag() {
    pointerDrag = null;
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    dragPreview?.remove();
    dragPreview = null;
    document.querySelectorAll('.dragging, .drag-over').forEach(node => node.classList.remove('dragging', 'drag-over'));
  }

  function dropTarget(item, x, y) {
    const node = document.elementFromPoint(x, y);
    if (item.type === 'skill') return node?.closest('[data-zone]');
    const list = node?.closest('#lesson-list');
    if (!list) return null;
    return [...list.children].find(row => y <= row.getBoundingClientRect().bottom) || list.lastElementChild;
  }

  function highlightDropTarget() {
    const target = dropTarget(pointerDrag, pointerDrag.x, pointerDrag.y);
    document.querySelector('.drag-over')?.classList.remove('drag-over');
    if (target !== pointerDrag.source) target?.classList.add('drag-over');
  }

  function scrollWhileDragging() {
    const y = pointerDrag.y;
    const speed = y < 55 ? -12 : y > window.innerHeight - 55 ? 12 : 0;
    if (speed) {
      window.scrollBy(0, speed);
      highlightDropTarget();
    }
    scrollFrame = requestAnimationFrame(scrollWhileDragging);
  }

  form.addEventListener('pointerdown', event => {
    if (saving || pointerDrag || !event.isPrimary || event.button !== 0 || event.target.closest('button')) return;
    const skill = event.target.closest(event.pointerType === 'mouse' ? '[data-drag-skill]' : '#current-action .skill-item, .skill-grip')?.closest('[data-drag-skill]');
    const lesson = event.target.closest(event.pointerType === 'mouse' ? '[data-lesson]' : '.lesson-grip')?.closest('[data-lesson]');
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
    if (pointerDrag?.pointerId !== event.pointerId) return;
    if (!pointerDrag.active) {
      if (Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY) < 6) return;
      pointerDrag.active = true;
      pointerDrag.source.classList.add('dragging');
      dragPreview = element('div', 'drag-preview', (pointerDrag.type === 'skill' ? skillLabels : lessonLabels).get(pointerDrag.id));
      dragPreview.setAttribute('aria-hidden', 'true');
      document.body.append(dragPreview);
      scrollFrame = requestAnimationFrame(scrollWhileDragging);
    }
    pointerDrag.x = event.clientX;
    pointerDrag.y = event.clientY;
    dragPreview.style.left = `${Math.min(event.clientX + 12, window.innerWidth - dragPreview.offsetWidth - 8)}px`;
    dragPreview.style.top = `${event.clientY + 12}px`;
    highlightDropTarget();
  });

  form.addEventListener('pointerup', event => {
    if (pointerDrag?.pointerId !== event.pointerId) return;
    const item = pointerDrag;
    const target = item.active && dropTarget(item, event.clientX, event.clientY);
    clearDrag();
    if (!target || target === item.source) return;
    if (item.type === 'skill') {
      placeSkill(item.id, target.dataset.zone);
    } else {
      const rect = target.getBoundingClientRect();
      const remaining = answers.lessonPriorities.filter(id => id !== item.id);
      const index = remaining.indexOf(target.dataset.lesson) + (event.clientY > rect.top + rect.height / 2 ? 1 : 0);
      moveLesson(item.id, index);
    }
  });
  form.addEventListener('pointercancel', event => {
    if (pointerDrag?.pointerId === event.pointerId) clearDrag();
  });
  form.addEventListener('lostpointercapture', event => {
    if (pointerDrag?.pointerId === event.pointerId) clearDrag();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || currentStep >= 4 || !stepIsComplete(currentStep)) return;
    if (currentStep === 3) {
      const incompleteStep = [0, 1, 2, 3].find(step => !stepIsComplete(step));
      if (incompleteStep !== undefined) return showStep(incompleteStep);
      answers.completedAt = new Date().toISOString();
      saving = true;
      form.inert = true;
      form.setAttribute('aria-busy', 'true');
      saveStatus.hidden = false;
      saveStatus.textContent = 'Saving your answers…';
      updateNavigation();
      try {
        const user = await api.currentUser();
        if (user.id !== initialAuthId) throw new Error('Your login changed. Return to login before continuing. Your answers have not been saved.');
        const saved = await api.saveSurvey(getAnswers());
        answers.completedAt = saved.completedAt;
      } catch (error) {
        answers.completedAt = null;
        saveStatus.textContent = `${api.explain(error)} Your answers are still here. Press Finish survey to try again.`;
        return;
      } finally {
        saving = false;
        form.inert = loginChanged;
        form.removeAttribute('aria-busy');
        updateNavigation();
      }
      saveStatus.textContent = 'Your survey has been saved to your account.';
      document.getElementById('complete-goal').textContent = goals.find(([id]) => id === answers.mainGoal)[1];
      document.getElementById('complete-priority').textContent = lessonLabels.get(answers.lessonPriorities[0]);
      // Consumers are notified only after the database confirms persistence.
      document.dispatchEvent(new CustomEvent('beanos:survey-completed', { detail: getAnswers() }));
    }
    showStep(currentStep + 1);
    if (currentStep === 4) api.goHome();
  });

  document.getElementById('back-button').addEventListener('click', () => showStep(currentStep - 1));
  document.getElementById('review-answers').addEventListener('click', () => showStep(0));
  window.BeanosSurvey = Object.freeze({ getAnswers });

  async function initialize() {
    const notice = document.getElementById('survey-account-notice');
    const message = document.getElementById('survey-account-message');
    const retry = document.getElementById('survey-load-retry');
    retry.hidden = true;
    retry.disabled = true;
    message.textContent = 'Loading your account…';
    try {
      const account = await api.requireAccount();
      if (!account) return;
      initialAuthId = (await api.currentUser()).id;
      const saved = await api.loadSurvey();
      if (saved) {
        // Refuse unknown/corrupt formats instead of silently overwriting them.
        const previous = getAnswers();
        if (saved.schemaVersion !== 1 || !saved.background || !saved.skills ||
          !Array.isArray(saved.skills.strengths) || !Array.isArray(saved.skills.practice) ||
          !Array.isArray(saved.lessonPriorities)) throw new Error('Your saved survey format could not be loaded. Ask your team for help.');
        Object.assign(answers, JSON.parse(JSON.stringify(saved)));
        const allSkills = [...answers.skills.strengths, ...answers.skills.practice];
        if (![0, 2, 3].every(stepIsComplete) || new Set(allSkills).size !== allSkills.length ||
          !allSkills.every(id => skillLabels.has(id))) {
          Object.assign(answers, previous);
          throw new Error('Your saved survey format could not be loaded. Ask your team for help.');
        }
        for (const [id] of skills) {
          if (!allSkills.includes(id)) skippedSkills.add(id);
        }
        saveStatus.hidden = false;
        saveStatus.textContent = 'Your saved answers are loaded. You can review them and save any changes.';
      }
      renderQuestions();
      renderSkills();
      renderLessons();
      showStep(0, false);
      notice.hidden = true;
      form.hidden = false;
      api.client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || (session && session.user.id !== initialAuthId)) {
          loginChanged = true;
          form.inert = true;
          saveStatus.hidden = false;
          saveStatus.textContent = 'Your login changed. Return to login before continuing.';
          document.getElementById('survey-login-link').hidden = false;
          notice.hidden = false;
          message.textContent = 'Please return to login to continue with the current account.';
        }
      });
    } catch (error) {
      message.textContent = api.explain(error);
      retry.hidden = false;
      document.getElementById('survey-login-link').hidden = false;
    } finally { retry.disabled = false; }
  }
  document.getElementById('survey-load-retry').addEventListener('click', initialize);
  initialize();
})();
