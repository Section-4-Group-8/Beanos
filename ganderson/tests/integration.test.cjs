const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { createStore } = require('../store.cjs');
const { createApp } = require('../app.cjs');
const { hashPassword } = require('../security.cjs');
const url = process.env.GANDERSON_TEST_DATABASE_URL;
test('real PostgreSQL authentication, CRUD, permissions, cookies and UI', {skip:!url}, async t=>{
  assert(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Only a disposable local DB may be tested');
  const store=createStore(url);
  await store.query('drop schema if exists ganderson cascade');
  for(const role of ['anon','authenticated']) await store.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if; end $$`);
  await store.query(fs.readFileSync(path.join(__dirname,'..','schema.sql'),'utf8'));
  await store.createUser('TA Account','ta@example.test',await hashPassword('test-password-long-enough'));
  const app=createApp({store,production:false,origin:'http://127.0.0.1:55440'});
  const server=app.listen(55440,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await store.close();});
  const base='http://127.0.0.1:55440';
  function client() {
    const cookies=new Map(); let csrf='';
    return {cookies,get csrf(){return csrf;}, async request(route,method='GET',body,extra={}){
      const res=await fetch(`${base}/ganderson/api/${route}`,{method,headers:{Origin:base,'Content-Type':'application/json','X-CSRF-Token':csrf,Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
      for(const header of res.headers.getSetCookie()){const [key,value]=header.split(';')[0].split('=');if(value)cookies.set(key,value);else cookies.delete(key);}
      const data=await res.json();if(data.csrf)csrf=data.csrf;return {res,data};
    }};
  }
  const a=client();
  await t.test('anonymous users cannot read or modify either business table',async()=>{
    assert.equal((await a.request('session')).data.user,null);
    for(const route of ['users','records']) {
      assert.equal((await a.request(route)).res.status,401);
      assert.equal((await a.request(route,'POST',{})).res.status,401);
      assert.equal((await a.request(`${route}/1`,'PUT',{})).res.status,401);
      assert.equal((await a.request(`${route}/1`,'DELETE',{})).res.status,401);
    }
    assert.equal((await a.request('login','POST',{user_email:'ta@example.test',user_password:'wrong-password'})).res.status,401);
  });
  await t.test('login rotates sessions and sets HttpOnly SameSite cookies',async()=>{
    const {res}=await a.request('login','POST',{user_email:'TA@example.test',user_password:'test-password-long-enough'});
    assert.equal(res.status,200);assert.match(res.headers.get('set-cookie'),/HttpOnly/);assert.match(res.headers.get('set-cookie'),/SameSite=Strict/);
    assert.equal((await a.request('session')).data.user.user_email,'ta@example.test');
    assert.equal((await a.request('users','POST',{}, {'X-CSRF-Token':'invalid'})).res.status,403);
    assert.equal((await a.request('records','POST',{}, {Origin:'https://attacker.test'})).res.status,403);
    const cookie=a.cookies.get('ganderson_csrf');await a.request('session');assert.equal(a.cookies.get('ganderson_csrf'),cookie,'CSRF stays stable between tabs');
  });
  let userId,recordId;
  await t.test('users can be created, displayed, edited and deleted without leaking hashes',async()=>{
    assert.equal((await a.request('users','POST',{user_name:'x',user_email:'x@x.test',user_password:'test'})).res.status,400);
    const created=await a.request('users','POST',{user_name:'<script>test</script>',user_email:'student@example.test',user_password:'student-password-long'});
    assert.equal(created.res.status,201);userId=created.data.user_id;assert(!('password_hash' in created.data));
    assert.equal((await a.request('users','POST',{user_name:'duplicate',user_email:'student@example.test',user_password:'student-password-long'})).res.status,409);
    const updated=await a.request(`users/${userId}`,'PUT',{user_name:'Updated Student',user_email:'student@example.test',user_password:''});
    assert.equal(updated.data.user_name,'Updated Student');
    assert(!(await a.request('users')).data.some(row=>'password_hash' in row));
    assert.equal((await a.request('users/1','DELETE',{})).res.status,409);
    assert.equal((await a.request('users/9999999999999999999','DELETE',{})).res.status,400);
    assert.equal((await a.request('users/999999','PUT',{user_name:'Missing',user_email:'missing@example.test',user_password:''})).res.status,404);
  });
  const record={title:"Practice '); drop table users;--",description:'<img src=x onerror=alert(1)> Ask a genuine question.',lesson_topic:'Confidence',difficulty:'Easy',estimated_minutes:5};
  await t.test('records persist and validate topic, time, and required fields',async()=>{
    const created=await a.request('records','POST',record);assert.equal(created.res.status,201);recordId=created.data.record_id;
    assert.equal((await a.request('records')).data[0].description,record.description);
    assert.equal((await a.request('records','POST',{...record,estimated_minutes:1.5})).res.status,400);
    assert.equal((await a.request('records','POST',{...record,lesson_topic:'Bad topic'})).res.status,400);
    assert.equal((await a.request('records','POST',{...record,title:' '})).res.status,400);
    assert.equal((await a.request(`records/${recordId}`,'PUT',{...record,title:'Updated practice'})).data.title,'Updated practice');
  });
  await t.test('actual page controller renders safely, edits a record, and hides data after logout',async()=>{
    const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'..','public','records.html'),'utf8'),{url:`${base}/ganderson/records`,runScripts:'outside-only'});
    t.after(()=>dom.window.close());
    dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
    dom.window.fetch=async(input,options={})=>{
      const endpoint=input.replace('/ganderson/api/','');
      const {res,data}=await a.request(endpoint,options.method||'GET',options.body?JSON.parse(options.body):undefined);
      return {ok:res.ok,status:res.status,json:async()=>data};
    };
    dom.window.eval(fs.readFileSync(path.join(__dirname,'..','public','site.js'),'utf8'));
    const waitFor=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI did not settle');};
    const doc=dom.window.document;
    await waitFor(()=>doc.querySelector('#rows').children.length===1);
    assert.equal(doc.querySelector('#management').hidden,false);
    assert.equal(doc.querySelector('#rows img'),null,'Stored HTML renders as text');
    doc.querySelector('#rows button').click();
    assert.equal(doc.querySelector('#editor').open,true);
    doc.querySelector('[name=title]').value='Saved through the real UI';
    doc.querySelector('#edit-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
    await waitFor(()=>doc.querySelector('#status').textContent==='Saved successfully.');
    assert.equal((await a.request('records')).data[0].title,'Saved through the real UI');
    doc.querySelector('#search').value='no matches';doc.querySelector('#search').dispatchEvent(new dom.window.Event('input'));
    assert.equal(doc.querySelector('#empty').hidden,false);
    doc.querySelector('#logout').click();await waitFor(()=>doc.querySelector('#status').textContent==='You have been logged out.');
    assert.equal(doc.querySelector('#management').hidden,true);assert.equal(doc.querySelector('#rows').children.length,0);assert.equal(doc.querySelector('#logout').hidden,true);
  });
  await t.test('deletion and password changes revoke existing sessions',async()=>{
    await a.request('session');await a.request('login','POST',{user_email:'ta@example.test',user_password:'test-password-long-enough'});
    const b=client();await b.request('session');assert.equal((await b.request('login','POST',{user_email:'student@example.test',user_password:'student-password-long'})).res.status,200);
    assert.equal((await a.request(`users/${userId}`,'PUT',{user_name:'Updated',user_email:'student@example.test',user_password:'replacement-password-long'})).res.status,200);
    assert.equal((await b.request('records')).res.status,401);
    assert.equal((await a.request(`users/${userId}`,'DELETE',{})).res.status,200);
    assert.equal((await a.request(`records/${recordId}`,'DELETE',{})).res.status,200);
    assert.equal((await a.request('records')).data.length,0);
    const oldCookie=a.cookies.get('ganderson_session');
    const logout=await a.request('logout','POST',{});assert.equal(logout.res.status,200);assert(!a.cookies.has('ganderson_session'));assert(!a.cookies.has('ganderson_csrf'));
    assert.equal((await a.request('records','GET',undefined,{Cookie:`ganderson_session=${oldCookie}`})).res.status,401);
  });
  await t.test('login throttling persists in the database',async()=>{
    await a.request('session');
    for(let i=0;i<12;i++)assert.equal((await a.request('login','POST',{user_email:'absent@example.test',user_password:'wrong'})).res.status,401);
    assert.equal((await a.request('login','POST',{user_email:'absent@example.test',user_password:'wrong'})).res.status,429);
    assert.equal((await store.query("select has_schema_privilege('anon','ganderson','USAGE') as permitted"))[0].permitted,false);
    assert.equal((await store.query("select has_schema_privilege('authenticated','ganderson','USAGE') as permitted"))[0].permitted,false);
  });
  await t.test('production session cookie is Secure and no private assets are published',async()=>{
    const prod=createApp({store,production:true,origin:base});const s=prod.listen(55441,'127.0.0.1');await new Promise(r=>s.once('listening',r));
    try {
      const r=await fetch('http://127.0.0.1:55441/ganderson/api/session');assert.match(r.headers.get('set-cookie'),/__Host-ganderson_csrf/);assert.match(r.headers.get('set-cookie'),/Secure/);
      for(const page of ['/ganderson/','/ganderson/users','/ganderson/records','/ganderson/site.js','/index.html'])assert.equal((await fetch(base+page)).status,200);
      for(const secret of ['/.env.local','/ganderson/schema.sql','/ganderson/store.cjs','/package.json'])assert.equal((await fetch(base+secret)).status,404);
    } finally {await new Promise(r=>s.close(r));}
  });
});
