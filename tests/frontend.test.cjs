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
  w.BeanosAPI={
    requireAccount:async()=>({userId:'9007199254740994'}),
    currentUser:async()=>({id:currentId}),
    loadSurvey:async()=>saved,
    saveSurvey:answers=>{calls.push(answers);return nextSave.promise;},
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
  return {dom,w,d,calls,fill,submit,setAuth:id=>{currentId=id;},next:()=>{nextSave=deferred();return nextSave;},get pending(){return nextSave;}};
}

test('Finish waits for saving, preserves answers on failure, retries once, and restores persisted answers',async()=>{
  const s=await survey();
  let completed=0;
  s.d.addEventListener('beanos:survey-completed',()=>completed++);
  s.fill();s.submit();s.submit();await tick();
  assert.equal(s.calls.length,1,'duplicate submit started a second save');
  assert.equal(completed,0);
  assert.equal(s.d.querySelector('[data-step="4"]').hidden,true);
  assert.equal(s.d.getElementById('next-button').disabled,true);
  s.pending.reject(new Error('Network unavailable'));await tick();
  assert.equal(s.w.BeanosSurvey.getAnswers().mainGoal,'find-girlfriend');
  assert.equal(s.d.querySelector('[data-step="3"]').hidden,false);
  assert.match(s.d.getElementById('survey-save-status').textContent,/still here/);
  assert.equal(s.d.getElementById('next-button').disabled,false);
  const retry=s.next();s.submit();await tick();
  const stored={...s.calls[1],completedAt:'2026-11-05T22:00:00Z'};
  retry.resolve(stored);await tick();
  assert.equal(completed,1);
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
