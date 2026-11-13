(() => {
  'use strict';
  const SUPABASE_URL = 'https://bzqepyhnvvrwzafydeqp.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_VbXs3R4Y6H4bVS63j2KkoA_g0trAUp5';
  const client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const loading = document.getElementById('loading');
  const dashboard = document.getElementById('dashboard');
  const signout = document.getElementById('signout');
  const number = value => new Intl.NumberFormat().format(Number(value) || 0);

  function showError(message) {
    loading.textContent = message;
    loading.classList.add('error');
    loading.insertAdjacentHTML('beforeend', '<div class="status-actions"><a href="login_page.html">Return to login</a></div>');
  }

  function setBadge(id, text, kind) {
    const el = document.getElementById(id);
    el.textContent = text;
    el.className = `badge ${kind}`;
  }

  async function initialize() {
    if (!client) return showError('The account service could not load. Check your connection and try again.');
    signout.disabled = false;
    signout.addEventListener('click', async () => {
      signout.disabled = true;
      await client.auth.signOut();
      window.location.replace('login_page.html');
    });

    const { data:authData, error:authError } = await client.auth.getUser();
    if (authError || !authData.user) return showError('Sign in with the team admin account to view this dashboard.');
    const { data, error } = await client.rpc('beanos_admin_dashboard_metrics');
    if (error) {
      if (error.message?.includes('ADMIN_ACCESS_REQUIRED')) {
        return showError('This signed-in account is not on the Beanos admin allowlist. Ask the project owner to add it.');
      }
      return showError('Dashboard metrics could not load. Check the admin setup and try again.');
    }

    const overview = data.overview || {};
    document.getElementById('total-users').textContent = number(overview.total_users);
    document.getElementById('survey-users').textContent = number(overview.survey_completed_users);
    document.getElementById('completed-tasks').textContent = number(overview.completed_task_records);
    document.getElementById('active-task-users').textContent = number(overview.users_with_completed_tasks);

    const date = data.okr3 || {};
    document.getElementById('plan-date-completions').textContent = `Plan a date: ${number(date.plan_date_task_completions)} completions · ${number(date.users_with_plan_date_completion)} users`;
    document.getElementById('go-date-completions').textContent = `Go on a date: ${number(date.go_on_date_task_completions)} completions · ${number(date.users_with_go_on_date_completion)} users`;
    if (!date.plan_date_task_available || !date.go_on_date_task_available) {
      setBadge('okr3-status', 'Task setup needed', 'missing');
    }
    document.getElementById('okr3-copy').textContent = 'Counts marked-complete task records across all users.';
    const girlfriend = data.okr4 || {};
    document.getElementById('girlfriend-completions').textContent = `${number(girlfriend.completed_task_records)} completions · ${number(girlfriend.users_completed)} users`;
    if (girlfriend.girlfriend_task_available) setBadge('okr4-status', 'Tracking available', 'ready');

    loading.hidden = true;
    dashboard.hidden = false;
  }
  initialize().catch(error => {
    console.error('Could not load the Beanos admin dashboard:', error);
    showError('Dashboard metrics could not load. Check the admin setup and try again.');
  });
})();
