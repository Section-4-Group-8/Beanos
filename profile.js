(() => {
  'use strict';
  const api = window.BeanosAPI;
  const content = document.getElementById('account-content');
  const status = document.getElementById('status-box');
  const colorPicker = document.getElementById('bean-color-picker');
  const colorStatus = document.getElementById('bean-color-status');
  const beanColors = {
    tan: { name: 'Tan', fill: '#EBD9C1', seam: '#A65E4F' },
    rust: { name: 'Rust', fill: '#A65E4F', seam: '#EBD9C1' },
    sage: { name: 'Sage', fill: '#5D9B7B', seam: '#1A2A40' },
    blue: { name: 'Blue', fill: '#4F8EA6', seam: '#1A2A40' }
  };
  let selectedColor = 'tan';

  function showBeanColor(color) {
    const choice = beanColors[color];
    const avatar = document.querySelector('.profile-avatar');
    avatar.style.setProperty('--bean-color', choice.fill);
    avatar.style.setProperty('--bean-seam', choice.seam);
    avatar.setAttribute('aria-label', `Beanos logo with a ${choice.name.toLowerCase()} bean`);
    document.getElementById('bean-color-name').textContent = choice.name;
    colorPicker.querySelector(`input[value="${color}"]`).checked = true;
    selectedColor = color;
  }

  async function loadBeanColor() {
    try {
      const user = await api.currentUser();
      const color = user.user_metadata?.beanos_bean_color;
      showBeanColor(Object.hasOwn(beanColors, color) ? color : 'tan');
    } catch {
      colorStatus.textContent = 'Your saved color could not load. Choose a color to save it.';
    } finally {
      colorPicker.disabled = false;
    }
  }

  colorPicker.addEventListener('change', async event => {
    const color = event.target.value;
    if (!Object.hasOwn(beanColors, color)) return;
    const previousColor = selectedColor;
    showBeanColor(color);
    colorPicker.disabled = true;
    colorStatus.dataset.failed = 'false';
    colorStatus.textContent = 'Saving bean color…';
    try {
      const { error } = await api.client.auth.updateUser({ data: { beanos_bean_color: color } });
      if (error) throw error;
      colorStatus.textContent = 'Bean color saved.';
    } catch (error) {
      showBeanColor(previousColor);
      colorStatus.dataset.failed = 'true';
      colorStatus.textContent = `Your bean color could not be saved. ${api.explain(error)}`;
    } finally {
      colorPicker.disabled = false;
    }
  });

  function message(text, failed = false, target = status) {
    target.hidden = false;
    target.dataset.failed = String(failed);
    target.textContent = text;
  }

  async function update(event, action) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    const feedback = event.currentTarget.querySelector('[role="status"]');
    button.disabled = true;
    feedback.hidden = true;
    try { message(await action(), false, feedback); }
    catch (error) { message(api.explain(error), true, feedback); }
    finally { button.disabled = false; }
  }

  document.getElementById('update-email-form').addEventListener('submit', event => update(event, async () => {
    const email = document.getElementById('new-email').value.trim();
    const { error } = await api.client.auth.updateUser({ email }, { emailRedirectTo: api.callbackUrl });
    if (error) throw error;
    document.getElementById('update-email-form').reset();
    return 'Check your inbox to confirm the email change. Your user ID and saved survey will stay the same.';
  }));

  document.getElementById('update-password-form').addEventListener('submit', event => update(event, async () => {
    const password = document.getElementById('new-password').value;
    if (password.length < 8) throw new Error('Choose a password with at least 8 characters.');
    const { error } = await api.client.auth.updateUser({ password });
    if (error) throw error;
    document.getElementById('update-password-form').reset();
    return 'Your password has been updated.';
  }));

  document.getElementById('signout-button').addEventListener('click', () => api.signOut().catch(error => message(api.explain(error), true)));

  async function loadProgress(authUserId) {
    try {
      const progress = await api.loadLessonProgress(authUserId);
      document.getElementById('lesson-count').textContent = progress.lessonOrder.length;
      document.getElementById('completed-count').textContent = progress.completedLessons.length;
      document.getElementById('star-count').textContent = Object.values(progress.starsByLesson).reduce((total, stars) => total + stars, 0);
    } catch {
      document.getElementById('progress-note').textContent = 'Lesson progress is currently unavailable.';
    }
  }

  async function initialize() {
    api.client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') window.location.replace('login_page.html');
    });
    const account = await api.requireAccount({ completed: true });
    if (!account) return;
    document.getElementById('current-email').textContent = account.email;
    document.getElementById('profile-email').textContent = account.email;
    document.getElementById('current-user-id').textContent = account.userId;
    status.hidden = true;
    content.hidden = false;
    loadProgress(account.authUserId);
    loadBeanColor();
  }
  initialize().catch(error => message(api.explain(error), true));
})();
