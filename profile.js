(() => {
  'use strict';
  const api = window.BeanosAPI;
  const content = document.getElementById('account-content');
  const status = document.getElementById('status-box');
  function message(text, failed = false) {
    status.style.display = 'block';
    status.style.borderLeft = `5px solid ${failed ? '#A65E4F' : '#5D9B7B'}`;
    status.textContent = text;
  }
  async function update(event, action) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try { await action(); } catch (error) { message(api.explain(error), true); }
    finally { button.disabled = false; }
  }
  document.getElementById('update-email-form').addEventListener('submit', event => update(event, async () => {
    const email = document.getElementById('new-email').value.trim();
    const { error } = await api.client.auth.updateUser({ email }, { emailRedirectTo: api.callbackUrl });
    if (error) throw error;
    message('Check your inbox to confirm the email change. Your user ID and saved survey will stay the same.');
    document.getElementById('update-email-form').reset();
  }));
  document.getElementById('update-password-form').addEventListener('submit', event => update(event, async () => {
    const password = document.getElementById('new-password').value;
    if (password.length < 8) throw new Error('Choose a password with at least 8 characters.');
    const { error } = await api.client.auth.updateUser({ password });
    if (error) throw error;
    message('Your password has been updated.');
    document.getElementById('update-password-form').reset();
  }));
  document.getElementById('signout-button').addEventListener('click', () => api.signOut().catch(error => message(api.explain(error), true)));
  async function initialize() {
    api.client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') window.location.replace('login_page.html');
    });
    const account = await api.requireAccount({ completed: true });
    if (!account) return;
    document.getElementById('current-email').textContent = account.email;
    document.getElementById('current-user-id').textContent = account.userId;
    content.hidden = false;
  }
  initialize().catch(error => message(api.explain(error), true));
})();
