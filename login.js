(() => {
  'use strict';
  const api = window.BeanosAPI;
  const form = document.getElementById('auth-form');
  const status = document.getElementById('status-message');
  const buttons = [...form.querySelectorAll('button')];
  let busy = false;
  let recovery = new URLSearchParams(window.location.search).has('recovery') ||
    new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';

  function message(text, failed = false) {
    status.textContent = text;
    status.style.color = failed ? '#A65E4F' : '#1A2A40';
  }

  function recoveryMode() {
    recovery = true;
    document.getElementById('signup-btn').hidden = true;
    document.getElementById('login-btn').hidden = true;
    document.getElementById('reset-password-btn').hidden = true;
    document.getElementById('save-password-btn').hidden = false;
    document.getElementById('email').required = false;
    document.getElementById('password').autocomplete = 'new-password';
    message('Choose a new password, then save it.');
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    buttons.forEach(button => { button.disabled = true; });
    try { await action(); } catch (error) { message(api.explain(error), true); }
    finally { busy = false; buttons.forEach(button => { button.disabled = false; }); }
  }

  async function loginOrSignup(signup) {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!form.reportValidity()) return;
    if (signup && password.length < 8) throw new Error('Choose a password with at least 8 characters.');
    message(signup ? 'Creating your account…' : 'Logging in…');
    const { data, error } = signup
      ? await api.client.auth.signUp({ email, password, options: { emailRedirectTo: api.callbackUrl } })
      : await api.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    document.getElementById('password').value = '';
    if (!data.session) {
      message('Check your email to confirm your account, then return here to log in.');
      return;
    }
    window.location.assign(await api.destination());
  }

  document.getElementById('signup-btn').addEventListener('click', () => run(() => loginOrSignup(true)));
  document.getElementById('login-btn').addEventListener('click', () => run(() => loginOrSignup(false)));
  form.addEventListener('submit', event => {
    event.preventDefault();
    document.getElementById(recovery ? 'save-password-btn' : 'login-btn').click();
  });
  document.getElementById('reset-password-btn').addEventListener('click', () => run(async () => {
    const emailInput = document.getElementById('email');
    if (!emailInput.reportValidity()) return;
    const redirectTo = new URL(api.callbackUrl);
    redirectTo.searchParams.set('recovery', '1');
    const { error } = await api.client.auth.resetPasswordForEmail(emailInput.value.trim(), { redirectTo: redirectTo.href });
    if (error) throw error;
    message('If that email has an account, a password reset link will arrive shortly.');
  }));
  document.getElementById('save-password-btn').addEventListener('click', () => run(async () => {
    const password = document.getElementById('password').value;
    if (password.length < 8) throw new Error('Choose a password with at least 8 characters.');
    await api.currentUser();
    const { error } = await api.client.auth.updateUser({ password });
    if (error) throw error;
    document.getElementById('password').value = '';
    window.history.replaceState(null, '', 'login_page.html');
    window.location.assign(await api.destination());
  }));

  async function initialize() {
    const callbackError = new URLSearchParams(window.location.hash.slice(1)).get('error_description');
    if (callbackError) {
      window.history.replaceState(null, '', 'login_page.html');
      message(callbackError, true);
      return;
    }
    api.client.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') recoveryMode();
    });
    const { data, error } = await api.client.auth.getSession();
    if (error) throw error;
    if (recovery) return recoveryMode();
    if (data.session) window.location.replace(await api.destination());
  }
  initialize().catch(error => message(api.explain(error), true));
})();
