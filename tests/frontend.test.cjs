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
    choose('experience','no-dates');choose('conversationStyle','start');choose('comfort','neutral');submit();
    for(const id of ['start-conversation','keep-conversation','follow-up-questions','plan-date','handle-rejection','check-mutual-interest']) {
      d.querySelector(`[data-skill="${id}"]`).click();
      d.querySelector('[data-place="strengths"]').click();
    }
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
  assert.equal(h.d.querySelector('a[href="beanos_lesson_template.html"]').textContent.trim(),'Go to lessons →');
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
