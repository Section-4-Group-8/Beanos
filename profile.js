(() => {
  'use strict';
  const api = window.BeanosAPI;
  const content = document.getElementById('account-content');
  const status = document.getElementById('status-box');

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
    const initials = account.email.split('@')[0].split(/[._+\s-]+/).filter(Boolean);
    document.getElementById('profile-initials').textContent = (
      initials.length > 1 ? initials[0][0] + initials[1][0] : account.email.slice(0, 2)
    ).toUpperCase();
    status.hidden = true;
    content.hidden = false;
    loadProgress(account.authUserId);
  }
  initialize().catch(error => message(api.explain(error), true));
})();
