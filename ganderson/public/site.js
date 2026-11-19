/* Shared controller for the three Ganderson pages. All data comes from our server. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const page = document.body.dataset.page;
  let csrf = '', user = null, entries = [], editing = null, deleting = null;
  let busy = false;
  const status = (text = '', kind = '') => { $('status').textContent = text; $('status').className = `message ${kind}`; };
  const sessionUI = () => {
    document.querySelectorAll('[data-private]').forEach(el => { el.hidden = !user; });
    $('logout').hidden = !user;
    if (page === 'overview') {
      $('login-card').hidden = !!user;
      $('account-card').hidden = !user;
      if (user) { $('account-name').textContent = `Welcome, ${user.user_name}.`; $('account-email').textContent = user.user_email; }
    } else {
      $('management').hidden = !user;
      $('login-gate').hidden = !!user;
      if (!user) { entries = []; $('rows').replaceChildren(); $('editor').close(); $('delete-dialog').close(); }
    }
  };
  async function api(endpoint, options = {}) {
    const response = await fetch(`/ganderson/api/${endpoint}`, { credentials:'same-origin', cache:'no-store', ...options,
      headers:{ 'Content-Type':'application/json', 'X-CSRF-Token':csrf, ...options.headers } });
    const result = await response.json().catch(() => ({ error:'The server returned an unexpected response. Please try again.' }));
    if (!response.ok) {
      if (response.status === 401 && endpoint !== 'login') { user = null; sessionUI(); }
      throw new Error(result.error || 'The request could not be completed.');
    }
    return result;
  }
  async function checkSession() {
    const session = await api('session');
    csrf = session.csrf; user = session.user;
    sessionUI();
  }
  document.querySelectorAll('nav a').forEach(link => {
    const current = page === 'overview' ? '/ganderson/' : `/ganderson/${page}`;
    if (link.getAttribute('href') === current) link.setAttribute('aria-current','page');
  });
  $('logout').addEventListener('click', async () => {
    $('logout').disabled = true;
    try {
      await api('logout',{ method:'POST',body:'{}' });
      user = null; sessionUI();
      await checkSession();
      status('You have been logged out.','success');
    } catch (error) { status(error.message,'error'); }
    finally { $('logout').disabled = false; }
  });
  if (page === 'overview') {
    $('login-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button'); button.disabled = true;
      status('Logging in…');
      try {
        await api('login',{ method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form))) });
        form.reset(); await checkSession();
        status('You’re signed in. Choose Maintain Users or Maintain Records.','success');
      } catch(error) { status(error.message,'error'); }
      finally { button.disabled = false; }
    });
  } else {
    const idKey = page === 'users' ? 'user_id' : 'record_id';
    function cell(value,label) {
      const td = document.createElement('td'); td.dataset.label = label;
      td.textContent = value;
      return td;
    }
    function actionButton(label, className, handler) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = className; button.textContent = label;
      button.addEventListener('click',handler); return button;
    }
    function render() {
      const search = $('search').value.trim().toLowerCase();
      const visible = entries.filter(entry => (page === 'users' ? `${entry.user_name} ${entry.user_email}` : `${entry.title} ${entry.description} ${entry.lesson_topic} ${entry.difficulty}`).toLowerCase().includes(search));
      $('rows').replaceChildren();
      $('empty').hidden = visible.length > 0;
      $('empty').textContent = search ? 'No matching entries. Try another search.' : `No ${page} yet. Add one to get started.`;
      $('count').textContent = `${visible.length} of ${entries.length} ${page}`;
      for (const entry of visible) {
        const row = document.createElement('tr');
        if (page === 'users') {
          row.append(cell(entry.user_name + (String(entry.user_id) === String(user.user_id) ? ' (you)' : ''),'Name'));
          row.append(cell(entry.user_email,'Email address'));
          row.append(cell(new Date(entry.created_at).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}),'Joined'));
        } else {
          const summary = cell('','Practice record');
          const title = document.createElement('strong'); title.textContent = entry.title;
          const description = document.createElement('p'); description.textContent = entry.description;
          summary.append(title,description);
          row.append(summary,cell(entry.lesson_topic,'Topic'),cell(entry.difficulty,'Difficulty'),cell(`${entry.estimated_minutes} min`,'Time'));
        }
        const actions = cell('','Actions'); const group = document.createElement('div'); group.className = 'actions';
        const name = page === 'users' ? entry.user_name : entry.title;
        const edit = actionButton('Edit','text-button',()=>openEditor(entry)); edit.setAttribute('aria-label',`Edit ${name}`);
        group.append(edit);
        if (page !== 'users' || String(entry.user_id) !== String(user.user_id)) {
          const remove = actionButton('Delete','text-button delete',()=>{
            deleting = entry; $('delete-description').textContent = name;
            $('delete-status').textContent = ''; $('delete-dialog').showModal(); $('cancel-delete').focus();
          });
          remove.setAttribute('aria-label',`Delete ${name}`); group.append(remove);
        }
        actions.append(group); row.append(actions); $('rows').append(row);
      }
    }
    async function load() {
      $('refresh').disabled = true;
      try { entries = await api(page); render(); }
      finally { $('refresh').disabled = false; }
    }
    function openEditor(entry = null) {
      editing = entry;
      const form = $('edit-form'); form.reset(); $('form-status').textContent = '';
      $('editor-title').textContent = `${entry ? 'Edit' : 'Add'} ${page === 'users' ? 'user' : 'record'}`;
      for (const field of form.elements) if (field.name && entry && field.name !== 'user_password') field.value = entry[field.name] ?? '';
      if (page === 'users') {
        form.elements.user_password.required = !entry;
        $('password-hint').textContent = entry ? 'Leave the password blank to keep it. Changing a password signs that user out on every device.' : 'Use 12–128 characters. Passwords are never displayed.';
      }
      $('editor').showModal(); form.querySelector('input').focus();
    }
    $('add').addEventListener('click',()=>openEditor());
    $('search').addEventListener('input',render);
    $('refresh').addEventListener('click',()=>load().then(()=>status('List refreshed.','success')).catch(error=>status(error.message,'error')));
    const closeEditor = () => { if (!busy) { $('edit-form').reset(); $('editor').close(); } };
    $('close-editor').addEventListener('click',closeEditor);
    $('cancel-editor').addEventListener('click',closeEditor);
    $('editor').addEventListener('cancel',event=>{ if (busy) event.preventDefault(); else $('edit-form').reset(); });
    $('delete-dialog').addEventListener('cancel',event=>{ if(busy) event.preventDefault(); });
    $('cancel-delete').addEventListener('click',()=>{ if(!busy) $('delete-dialog').close(); });
    $('edit-form').addEventListener('submit',async event=>{
      event.preventDefault(); if (busy) return;
      const form = event.currentTarget;
      busy = true; $('save').disabled = true; $('form-status').textContent = '';
      try {
        const body = Object.fromEntries(new FormData(form));
        if (page === 'records') body.estimated_minutes = Number(body.estimated_minutes);
        const result = await api(editing ? `${page}/${editing[idKey]}` : page, { method:editing ? 'PUT' : 'POST',body:JSON.stringify(body) });
        $('editor').close(); form.reset();
        if (result.signedOut) { user = null; sessionUI(); status('Password updated. Log in again with the new password.','success'); return; }
        await checkSession();
        if (user) await load();
        status('Saved successfully.','success');
      } catch(error) { $('form-status').textContent = error.message; status(error.message,'error'); }
      finally { busy = false; $('save').disabled = false; }
    });
    $('confirm-delete').addEventListener('click',async()=>{
      if(busy) return; busy = true; $('confirm-delete').disabled = true;
      try {
        await api(`${page}/${deleting[idKey]}`,{method:'DELETE',body:'{}'});
        $('delete-dialog').close(); await load(); status('Entry deleted.','success');
      } catch(error) { $('delete-status').textContent = error.message; status(error.message,'error'); }
      finally { busy = false; $('confirm-delete').disabled = false; }
    });
    // Also clear private data when a tab returns from the browser's back/forward cache.
    window.addEventListener('pageshow',event=>{if(event.persisted) start();});
    async function start() {
      try { await checkSession(); if(user) await load(); status(); }
      catch(error) { status(error.message,'error'); }
    }
    start();
    return;
  }
  checkSession().then(()=>status()).catch(error=>status(error.message,'error'));
})();
