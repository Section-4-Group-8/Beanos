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

    const assignments = data.okr1 || {};
    const assignmentStatus = assignments.status || 'waiting_for_assignments';
    if (assignmentStatus === 'tracking') setBadge('okr1-status', 'Tracking', 'ready');
    else setBadge('okr1-status', 'Waiting for assignments', 'partial');
    const completionRate = assignments.completion_rate == null ? null : Number(assignments.completion_rate);
    document.getElementById('okr1-rate').textContent = Number.isFinite(completionRate)
      ? `${completionRate.toFixed(1)}% completed` : '—';
    document.getElementById('okr1-counts').textContent = `${number(assignments.completed_assigned_tasks)} of ${number(assignments.assigned_tasks)} assigned tasks completed · ${number(assignments.users_assigned_tasks)} users assigned`;

    const ratings = data.okr2 || {};
    const ratingStatus = ratings.status || 'waiting_for_ratings';
    if (ratingStatus === 'tracking') setBadge('okr2-status', 'Tracking', 'ready');
    else if (ratingStatus === 'waiting_for_repeats') setBadge('okr2-status', 'Waiting for repeat ratings', 'partial');
    else setBadge('okr2-status', 'Waiting for ratings', 'partial');
    const avgChange = ratings.average_rating_change == null ? null : Number(ratings.average_rating_change);
    document.getElementById('okr2-average-change').textContent = Number.isFinite(avgChange)
      ? `${avgChange > 0 ? '+' : ''}${avgChange.toFixed(2)} stars per repeat attempt` : '—';
    document.getElementById('okr2-attempt-count').textContent = `${number(ratings.repeat_attempts)} repeat ratings · ${number(ratings.rated_attempts)} total ratings`;
    const trend = Array.isArray(ratings.rating_trend) ? ratings.rating_trend : [];
    const trendBody = document.getElementById('okr2-trend');
    trendBody.replaceChildren();
    trend.forEach(point => {
      const row = document.createElement('tr');
      const week = document.createElement('td'); week.textContent = point.week_start || '';
      const change = document.createElement('td');
      const amount = Number(point.average_change);
      change.textContent = Number.isFinite(amount) ? `${amount > 0 ? '+' : ''}${amount.toFixed(2)} stars` : '—';
      const count = document.createElement('td'); count.textContent = number(point.repeat_attempts);
      row.append(week, change, count); trendBody.append(row);
    });
    document.getElementById('okr2-trend-table').hidden = trend.length === 0;
    document.getElementById('okr2-trend-empty').hidden = trend.length > 0;

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
