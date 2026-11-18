const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { JSDOM } = require('jsdom');
const root = resolve(__dirname, '..');
const read = name => readFileSync(resolve(root, name), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }
function page(name) { return new JSDOM(read(name), { url:`https://example.test/Beanos/${name}`, runScripts:'outside-only' }); }

async function survey(saved = null) {
  const dom = page('survey.html');
  const { window:w } = dom;
  const calls=[];
  let currentId='auth-one';
  let nextSave=deferred();
  let homeVisits=0;
  w.BeanosAPI={
    requireAccount:async()=>({userId:'9007199254740994'}),
    currentUser:async()=>({id:currentId}),
    loadSurvey:async()=>saved,
    saveSurvey:answers=>{calls.push(answers);return nextSave.promise;},
    goHome:()=>{homeVisits++;},
    explain:error=>error.message,
    client:{auth:{onAuthStateChange:()=>{}}}
  };
  w.eval(read('survey.js'));
  await tick();
  const d=w.document;
  const submit=()=>d.getElementById('survey-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  function choose(name,value) {
    const input=d.querySelector(`input[name="${name}"][value="${value}"]`);
    assert.ok(input,`${name} ${value}`);
    input.checked=true; input.dispatchEvent(new w.Event('change',{bubbles:true}));
  }
  function fill() {
    const visibleQuestions=()=>d.querySelectorAll('.question:not([hidden])').length;
    assert.equal(visibleQuestions(),1);
    choose('experience','no-dates');assert.equal(visibleQuestions(),2);
    choose('conversationStyle','start');assert.equal(visibleQuestions(),3);
    choose('comfort','neutral');submit();
    for(let index=0;index<12;index++) {
      assert.equal(d.querySelectorAll('#current-action [data-drag-skill]').length,1);
      assert.equal(d.getElementById('next-button').disabled,true);
      d.querySelector(index<6 ? '[data-place="strengths"]' : '#skip-skill').click();
    }
    assert.equal(d.querySelectorAll('#current-action [data-drag-skill]').length,0);
    submit();choose('mainGoal','find-girlfriend');submit();
    assert.equal(d.querySelector('[data-step="3"]').hidden,false);
  }
  return {dom,w,d,calls,fill,submit,setAuth:id=>{currentId=id;},next:()=>{nextSave=deferred();return nextSave;},get pending(){return nextSave;},get homeVisits(){return homeVisits;}};
}

test('Finish waits for saving, preserves answers on failure, retries once, and restores persisted answers',async()=>{
  const s=await survey();
  let completed=0;
  s.d.addEventListener('beanos:survey-completed',()=>completed++);
  s.fill();s.submit();s.submit();await tick();
  assert.equal(s.calls.length,1,'duplicate submit started a second save');
  assert.equal(completed,0);
  assert.equal(s.homeVisits,0);
  assert.equal(s.d.querySelector('[data-step="4"]').hidden,true);
  assert.equal(s.d.getElementById('next-button').disabled,true);
  s.pending.reject(new Error('Network unavailable'));await tick();
  assert.equal(s.w.BeanosSurvey.getAnswers().mainGoal,'find-girlfriend');
  assert.equal(s.d.querySelector('[data-step="3"]').hidden,false);
  assert.match(s.d.getElementById('survey-save-status').textContent,/still here/);
  assert.equal(s.d.getElementById('next-button').disabled,false);
  assert.equal(s.homeVisits,0,'failed saves must stay on the survey');
  const retry=s.next();s.submit();await tick();
  const stored={...s.calls[1],completedAt:'2026-11-05T22:00:00Z'};
  retry.resolve(stored);await tick();
  assert.equal(completed,1);
  assert.equal(s.homeVisits,1,'successful completion should go home exactly once');
  assert.equal(s.d.querySelector('[data-step="4"]').hidden,false);
  const restored=await survey(stored);
  assert.equal(restored.d.querySelectorAll('.question:not([hidden])').length,3);
  assert.equal(restored.d.querySelector('input[name="mainGoal"]:checked').value,'find-girlfriend');
  assert.equal(restored.w.BeanosSurvey.getAnswers().skills.strengths.length,6);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.w.BeanosSurvey.getAnswers().lessonPriorities)),JSON.parse(JSON.stringify(stored.lessonPriorities)));
  s.dom.window.close();restored.dom.window.close();
});

test('a different login cannot save the answers entered by the previous user',async()=>{
  const s=await survey();s.fill();s.setAuth('auth-two');s.submit();await tick();
  assert.equal(s.calls.length,0);
  assert.match(s.d.getElementById('survey-save-status').textContent,/login changed/);
  assert.equal(s.d.querySelector('[data-step="3"]').hidden,false);
  s.dom.window.close();
});

test('unknown saved formats stay hidden rather than overwriting saved answers',async()=>{
  const s=await survey({schemaVersion:2});
  assert.equal(s.d.getElementById('survey-form').hidden,true);
  assert.match(s.d.getElementById('survey-account-message').textContent,/format/);
  assert.equal(s.calls.length,0);
  s.dom.window.close();
});

test('browser API sends only answers and never supplies an ownership ID',async()=>{
  const dom=page('survey.html');const w=dom.window;const calls=[];
  w.localStorage.setItem('active_user_id','someone-else');
  w.supabase={createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{completedAt:'server'}};}})};
  w.eval(read('beanos-api.js'));
  await w.BeanosAPI.saveSurvey({mainGoal:'ask-on-date'});
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{name:'beanos_save_survey',args:{p_answers:{mainGoal:'ask-on-date'}}}]);
  dom.window.close();
});

test('signup supports both immediate sessions and later email confirmation',async()=>{
  for(const session of [null,{user:{id:'auth-one'}}]) {
    const dom=page('login_page.html');const w=dom.window;let destinationCalls=0;let signupArgs;
    w.BeanosAPI={explain:e=>e.message,callbackUrl:'https://example.test/Beanos/login_page.html',
      currentUser:async()=>session?.user,
      destination:async()=>{destinationCalls++;throw new Error('Navigation checked');},
      client:{auth:{onAuthStateChange:()=>{},getSession:async()=>({data:{session:null}}),
        signUp:async args=>{signupArgs=args;return {data:{session}};}}}};
    w.eval(read('login.js'));await tick();
    w.document.getElementById('email').value='new@example.invalid';
    w.document.getElementById('password').value='testing-only-password';
    w.document.getElementById('signup-btn').click();await tick();
    assert.equal(signupArgs.email,'new@example.invalid');
    assert.equal(destinationCalls,session?1:0);
    if(!session) assert.match(w.document.getElementById('status-message').textContent,/Check your email/);
    dom.window.close();
  }
});

test('login and profile code use Supabase Auth without direct credential-table access',()=>{
  for(const file of ['login.js','profile.js']) {
    assert.doesNotMatch(read(file),/SIGN_IN|password_hash|active_user_email|active_user_id/);
  }
  assert.match(read('login.js'),/signInWithPassword/);
  assert.match(read('profile.js'),/auth\.updateUser/);
});

test('login destinations require a saved survey before going home',async()=>{
  const dom=page('login_page.html');const w=dom.window;let complete=false;
  w.supabase={createClient:()=>({rpc:async()=>({data:{surveyCompleted:complete}})})};
  w.eval(read('beanos-api.js'));
  assert.equal(await w.BeanosAPI.destination(),'survey.html');
  complete=true;
  assert.equal(await w.BeanosAPI.destination(),'index.html');
  dom.window.close();
});

async function home({allowed=true,focusError=false,accountError=false}={}) {
  const dom=page('index.html');const w=dom.window;const calls=[];let authChanged;
  w.BeanosAPI={
    requireAccount:async options=>{calls.push(options);if(accountError)throw new Error('Account service unavailable');return allowed?{userId:'9007199254740994'}:null;},
    currentUser:async()=>({id:'auth-one'}),
    loadSurvey:async()=>{if(focusError)throw new Error('Offline');return {mainGoal:'ask-on-date'};},
    loadLessonProgress:async(userId, survey)=>{
      assert.equal(userId,'auth-one');
      assert.equal(survey.mainGoal,'ask-on-date');
      return {nextLessonId:5};
    },
    explain:e=>e.message,
    signOut:async()=>{throw new Error('Could not log out. Try again.');},
    client:{auth:{onAuthStateChange:callback=>{authChanged=callback;return {data:{subscription:{unsubscribe(){}}}};}}}
  };
  w.eval(read('home.js'));await tick();
  return {dom,w,d:w.document,calls,authChanged};
}

test('home gates content on a completed account and shows only the saved focus',async()=>{
  const h=await home();
  assert.equal(h.calls[0].completed,true);
  assert.equal(h.d.getElementById('home-content').hidden,false);
  assert.equal(h.d.getElementById('home-goal').textContent,'Ask someone on a date.');
  assert.equal(h.d.querySelector('a[href="tasks.html"]').textContent.trim(),'Go to tasks →');
  assert.ok(h.d.querySelector('a[href="lessons.html"]'));
  assert.match(h.d.querySelector('#home-lesson-list a[href$="?lesson=5"]').textContent,/Asking someone out and planning a date/);
  h.d.getElementById('home-signout').click();await tick();
  assert.equal(h.d.getElementById('home-signout').disabled,false);
  assert.match(h.d.getElementById('home-account-status').textContent,/Could not log out/);
  h.dom.window.close();
  const denied=await home({allowed:false});
  assert.equal(denied.d.getElementById('home-content').hidden,true);
  denied.dom.window.close();
});

test('home fails closed on account errors but can show navigation if only focus loading fails',async()=>{
  const failure=await home({accountError:true});
  assert.equal(failure.d.getElementById('home-content').hidden,true);
  assert.equal(failure.d.getElementById('home-retry-actions').hidden,false);
  assert.match(failure.d.getElementById('home-loading-message').textContent,/Account service unavailable/);
  failure.dom.window.close();
  const partial=await home({focusError:true});
  assert.equal(partial.d.getElementById('home-content').hidden,false);
  assert.match(partial.d.getElementById('home-account-status').textContent,/focus couldn’t load/);
  partial.dom.window.close();
});

const lessonKeys = ['confidence', 'conversations', 'interest-and-boundaries',
  'asking-someone-out', 'date-planning', 'following-up'];

function lessonSession(file = 'lessons.html') {
  const dom = page(file);
  const { window: w } = dom;
  let user = { id: 'auth-one' };
  const surveys = new Map();
  w.supabase = { createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user } }),
      getSession: async () => ({ data: { session: { user } } })
    },
    rpc: async (name) => ({ data: name === 'beanos_account'
      ? { surveyCompleted: true }
      : surveys.get(user.id) })
  }) };
  w.eval(read('beanos-api.js'));
  return {
    dom, w, api: w.BeanosAPI,
    setUser(id) { user = { id }; },
    rank(ids) { surveys.set(user.id, { lessonPriorities: ids.map(id => lessonKeys[id - 1]) }); }
  };
}

test('survey order drives the rendered path and 10 stars unlock the next ranked lesson', async () => {
  const session = lessonSession();
  const { dom, w, api } = session;
  session.rank([5, 2, 1, 3, 4, 6]);
  w.eval(read('lessons.js'));
  await tick();
  const cards = [...w.document.querySelectorAll('#lesson-cards > *')];
  assert.deepEqual(cards.map(card => card.querySelector('.lesson-choice-number').textContent),
    ['LESSON 05', 'LESSON 02', 'LESSON 01', 'LESSON 03', 'LESSON 04', 'LESSON 06']);
  assert.equal(cards[0].getAttribute('href'), 'beanos_lesson_template.html?lesson=5');
  assert.equal(cards[1].getAttribute('aria-disabled'), 'true');
  const task = (id, lessonId) => ({ id, difficulty: 5, lesson_id: lessonId });
  await assert.rejects(api.completeLessonTask(2, task('early', 2), 'auth-one'), /available lesson/);
  await api.completeLessonTask(5, task('first', 5), 'auth-one');
  const duplicate = await api.completeLessonTask(5, task('first', 5), 'auth-one');
  assert.equal(duplicate.starsByLesson[5], 5);
  assert.equal(duplicate.nextLessonId, 5);
  const unlocked = await api.completeLessonTask(5, task('second', 5), 'auth-one');
  assert.equal(unlocked.nextLessonId, 2);
  assert.deepEqual(Array.from(unlocked.unlockedLessonIds), [5, 2]);

  session.setUser('auth-two');
  session.rank([4, 3, 2, 1, 5, 6]);
  const other = await api.loadLessonProgress('auth-two');
  assert.equal(other.nextLessonId, 4);
  assert.deepEqual(Array.from(other.unlockedLessonIds), [4]);
  assert.equal(other.starsByLesson[5], 0);
  dom.window.close();
});

test('legacy unlocks and earned stars survive survey reordering, including unlocks with zero stars', async () => {
  const session = lessonSession();
  const { dom, w, api } = session;
  const storageKey = 'beanos_lesson_tasks:auth-one';
  w.localStorage.setItem(storageKey, JSON.stringify({ completedTasks: { 1: { a: 5, b: 5 } } }));
  session.rank([6, 3, 2, 1, 4, 5]);
  const migrated = await api.loadLessonProgress('auth-one');
  assert.equal(migrated.nextLessonId, 6);
  assert.deepEqual(Array.from(migrated.unlockedLessonIds), [6, 2, 1]);
  assert.equal(migrated.starsByLesson[1], 10);
  assert.equal(migrated.starsByLesson[2], 0);

  session.rank([4, 2, 6, 1, 3, 5]);
  const reordered = await api.loadLessonProgress('auth-one');
  assert.equal(reordered.nextLessonId, 4);
  assert.deepEqual(Array.from(reordered.unlockedLessonIds), [4, 2, 6, 1]);
  const revisit = await api.completeLessonTask(2, { id: 'old-access', difficulty: 3, lesson_id: 2 }, 'auth-one');
  assert.equal(revisit.starsByLesson[2], 3);
  assert.equal(revisit.nextLessonId, 4);
  dom.window.close();
});

test('AI suggestion previews and dismissals never save, but accepting changes the stored path', async () => {
  const dom = page('lessons.html');
  const w = dom.window;
  const d = w.document;
  const user = { id: 'auth-one' };
  const survey = { lessonPriorities: lessonKeys, completedAt: 'revision-1' };
  const choice = { lessonIds: [5, 2, 1, 3, 4, 6], reason: 'Start with date planning.', surveyCompletedAt: survey.completedAt };
  let saveCalls = 0;
  w.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user } } }) },
    functions: { invoke: async (name, options) => {
      assert.equal(name, 'suggest-lesson-order');
      assert.deepEqual(Object.keys(options.body), []);
      return { data: choice };
    } },
    rpc: async (name, args) => {
      if (name === 'beanos_account') return { data: { surveyCompleted: true } };
      if (name === 'beanos_accept_lesson_order') {
        saveCalls++;
        assert.deepEqual(args.p_order, choice.lessonIds);
        assert.equal(args.p_survey_completed_at, survey.completedAt);
        survey.acceptedLessonOrder = args.p_order;
      }
      return { data: survey };
    }
  }) };
  w.eval(read('beanos-api.js'));
  w.eval(read('lessons.js'));
  await tick();
  const firstCard = () => d.querySelector('#lesson-cards > a').getAttribute('href');
  assert.match(firstCard(), /lesson=1$/);
  d.getElementById('suggest-lesson-order').click();
  await tick();
  assert.equal(d.getElementById('lesson-order-preview').hidden, false);
  assert.equal(d.querySelector('#suggested-lessons li').textContent, 'Asking someone out and planning a date');
  assert.match(firstCard(), /lesson=1$/);
  assert.equal(saveCalls, 0);
  d.getElementById('keep-lesson-order').click();
  assert.equal(saveCalls, 0);
  assert.equal(d.getElementById('lesson-order-preview').hidden, true);

  d.getElementById('suggest-lesson-order').click();
  await tick();
  d.getElementById('accept-lesson-order').click();
  await tick();
  assert.equal(saveCalls, 1);
  assert.match(firstCard(), /lesson=5$/);
  assert.deepEqual(survey.lessonPriorities, lessonKeys);
  const progress = await w.BeanosAPI.loadLessonProgress(user.id);
  assert.equal(progress.nextLessonId, 5);
  assert.deepEqual(Array.from(progress.unlockedLessonIds), [5, 1]);
  dom.window.close();
});

test('profile preserves account identity and submits email and password changes with inline feedback', async () => {
  const dom = page('profile.html');
  const { window: w } = dom;
  const calls = [];
  let pending = deferred();
  let signedOut = 0;
  w.BeanosAPI = {
    callbackUrl: 'https://example.test/Beanos/login_page.html',
    requireAccount: async options => {
      assert.equal(options.completed, true);
      return { email: 'luke.melanson@example.com', userId: '9007199254740994', authUserId: 'auth-one' };
    },
    loadLessonProgress: async id => {
      assert.equal(id, 'auth-one');
      return { lessonOrder: [1, 3, 2, 4, 5, 6], completedLessons: [1, 3], starsByLesson: { 1: 10, 3: 12 } };
    },
    signOut: async () => { signedOut++; },
    currentUser: async () => ({ user_metadata: {} }),
    explain: error => error.message,
    client: { auth: {
      onAuthStateChange() {},
      updateUser: (...args) => { calls.push(args); return pending.promise; }
    } }
  };
  w.eval(read('profile.js'));
  await tick();
  const d = w.document;
  assert.equal(d.getElementById('account-content').hidden, false);
  assert.equal(d.getElementById('current-user-id').textContent, '9007199254740994');
  assert.equal(d.getElementById('current-email').textContent, 'luke.melanson@example.com');
  assert.equal(d.querySelector('.profile-avatar').getAttribute('aria-label'), 'Beanos logo with a tan bean');
  assert.equal(d.getElementById('lesson-count').textContent, '6');
  assert.equal(d.getElementById('completed-count').textContent, '2');
  assert.equal(d.getElementById('star-count').textContent, '22');
  const emailForm = d.getElementById('update-email-form');
  const email = d.getElementById('new-email');
  const submit = form => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  email.value = 'new@example.com';
  submit(emailForm);
  assert.equal(emailForm.querySelector('button').disabled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), [{ email: 'new@example.com' }, { emailRedirectTo: w.BeanosAPI.callbackUrl }]);
  pending.resolve({ error: { message: 'Email update failed' } });
  await tick();
  assert.equal(email.value, 'new@example.com');
  assert.equal(emailForm.querySelector('[role="status"]').hidden, false);
  assert.equal(emailForm.querySelector('[role="status"]').dataset.failed, 'true');
  assert.equal(emailForm.querySelector('button').disabled, false);
  pending = deferred();
  submit(emailForm);
  pending.resolve({ error: null });
  await tick();
  assert.equal(email.value, '');
  assert.match(emailForm.querySelector('[role="status"]').textContent, /Check your inbox/);
  assert.equal(d.getElementById('current-user-id').textContent, '9007199254740994');
  const passwordForm = d.getElementById('update-password-form');
  const password = d.getElementById('new-password');
  password.value = 'short';
  submit(passwordForm);
  await tick();
  assert.equal(calls.length, 2, 'invalid passwords must not reach Supabase');
  assert.match(passwordForm.querySelector('[role="status"]').textContent, /at least 8 characters/);
  pending = deferred();
  password.value = 'synthetic-test-password';
  submit(passwordForm);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[2])), [{ password: 'synthetic-test-password' }]);
  pending.resolve({ error: null });
  await tick();
  assert.equal(password.value, '');
  assert.equal(passwordForm.querySelector('[role="status"]').textContent, 'Your password has been updated.');
  d.getElementById('signout-button').click();
  assert.equal(signedOut, 1);
  dom.window.close();
});

test('profile account settings remain available when progress fails and hidden when account checks fail', async () => {
  for (const accountFails of [false, true]) {
    const dom = page('profile.html');
    const { window: w } = dom;
    w.BeanosAPI = {
      requireAccount: async () => {
        if (accountFails) throw new Error('Account unavailable');
        return { email: 'longusername@example.com', userId: 42, authUserId: 'auth-one' };
      },
      loadLessonProgress: async () => { throw new Error('Progress unavailable'); },
      currentUser: async () => ({ user_metadata: {} }),
      explain: error => error.message,
      client: { auth: { onAuthStateChange() {} } }
    };
    w.eval(read('profile.js'));
    await tick();
    const d = w.document;
    assert.equal(d.getElementById('account-content').hidden, accountFails);
    if (accountFails) {
      assert.equal(d.getElementById('status-box').textContent, 'Account unavailable');
    } else {
      assert.equal(d.getElementById('bean-color-picker').disabled, false);
      assert.equal(d.getElementById('completed-count').textContent, '—');
      assert.equal(d.getElementById('progress-note').textContent, 'Lesson progress is currently unavailable.');
      assert.equal(d.getElementById('new-email').disabled, false);
    }
    dom.window.close();
  }
});

test('profile saves only approved bean colors, restores the saved color, and rolls back failed saves', async () => {
  let metadata = { other_preference: 'keep' };
  let nextError = null;
  const updates = [];
  async function openProfile() {
    const dom = page('profile.html');
    const { window: w } = dom;
    w.BeanosAPI = {
      requireAccount: async () => ({ email: 'sample@example.com', userId: '42', authUserId: 'auth-one' }),
      currentUser: async () => ({ user_metadata: metadata }),
      loadLessonProgress: async () => ({ lessonOrder: [1,2,3,4,5,6], completedLessons: [], starsByLesson: {} }),
      explain: error => error.message,
      client: { auth: {
        onAuthStateChange() {},
        updateUser: async attributes => {
          updates.push(JSON.parse(JSON.stringify(attributes)));
          if (!nextError) metadata = { ...metadata, ...attributes.data };
          return { error: nextError };
        }
      } }
    };
    w.eval(read('profile.js'));
    await tick();
    return dom;
  }
  let dom = await openProfile();
  let d = dom.window.document;
  assert.equal(d.getElementById('bean-color-picker').disabled, false);
  assert.equal(d.querySelectorAll('input[name="bean-color"]').length, 4);
  assert.equal(d.querySelector('input[name="bean-color"]:checked').value, 'tan');
  d.querySelector('input[value="blue"]').click();
  await tick();
  assert.deepEqual(updates, [{ data: { beanos_bean_color: 'blue' } }]);
  assert.equal(d.querySelector('.profile-avatar').style.getPropertyValue('--bean-color'), '#4F8EA6');
  assert.equal(d.getElementById('bean-color-status').textContent, 'Bean color saved.');
  assert.equal(metadata.other_preference, 'keep');
  dom.window.close();
  dom = await openProfile();
  d = dom.window.document;
  assert.equal(d.querySelector('input[name="bean-color"]:checked').value, 'blue');
  assert.equal(updates.length, 1, 'loading a saved preference must not write to the account');
  nextError = { message: 'Connection failed' };
  d.querySelector('input[value="rust"]').click();
  await tick();
  assert.equal(d.querySelector('input[name="bean-color"]:checked').value, 'blue');
  assert.equal(d.getElementById('bean-color-picker').disabled, false);
  assert.equal(d.getElementById('bean-color-status').dataset.failed, 'true');
  assert.equal(metadata.beanos_bean_color, 'blue');
  dom.window.close();
  metadata.beanos_bean_color = '__proto__';
  dom = await openProfile();
  assert.equal(dom.window.document.querySelector('input[name="bean-color"]:checked').value, 'tan');
  assert.equal(updates.length, 2, 'invalid saved colors must fall back without an account write');
  dom.window.close();
});

test('each lesson route renders distinct copy while retaining its resource and roleplay loaders', async () => {
  const titles = ['Building confidence and handling nerves', 'Texting and keeping conversations flowing',
    'Handling rejection with self-respect', 'Personal style and grooming',
    'Asking someone out and planning a date', 'How to have good dates'];
  const intros = new Set();
  const frameworks = new Set();
  for (let id = 1; id <= 6; id++) {
    const dom = new JSDOM(read('beanos_lesson_template.html'), {
      url: `https://example.test/Beanos/beanos_lesson_template.html?lesson=${id}`, runScripts: 'outside-only'
    });
    const w = dom.window;
    const loaded = [];
    w.BeanosAPI = {
      requireAccount: async () => ({ authUserId: 'auth-one' }),
      loadLessonProgress: async () => ({ unlockedLessonIds: [1,2,3,4,5,6], completedLessons: [], starsByLesson: {}, completedTaskIdsByLesson: {} }),
      loadLessonRoleplayConfig: async lessonId => { loaded.push(['roleplay', lessonId]); return null; },
      loadLessonResources: async lessonId => { loaded.push(['resources', lessonId]); return []; },
      loadLessonTasks: async () => [], explain: e => e.message
    };
    for (const script of w.document.querySelectorAll('script:not([src])')) w.eval(script.textContent);
    await tick();
    assert.equal(w.document.querySelector('#step-1 h1').textContent, titles[id - 1]);
    assert.equal(w.document.getElementById('lesson-content').hidden, false);
    assert.ok(loaded.some(([kind, lessonId]) => kind === 'resources' && lessonId === id));
    assert.ok(loaded.some(([kind, lessonId]) => kind === 'roleplay' && lessonId === id));
    intros.add(w.document.getElementById('lesson-intro').textContent);
    frameworks.add(w.document.getElementById('lesson-framework').textContent);
    assert.ok(w.document.getElementById('lesson-tip').textContent);
    assert.ok(w.document.getElementById('lesson-caution').textContent);
    dom.window.close();
  }
  assert.equal(intros.size, 6);
  assert.equal(frameworks.size, 6);
});
