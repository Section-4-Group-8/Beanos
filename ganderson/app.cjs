const express = require('express');
const path = require('node:path');
const { digest, token, hashPassword, verifyPassword, passwordValid } = require('./security.cjs');
const { createStore } = require('./store.cjs');
const topics = ['Confidence','Texting','Rejection','Personal style','Invitations','Good dates'];
const difficulties = ['Easy','Medium','Challenging'];
function createApp({ store, production = process.env.NODE_ENV === 'production', origin = process.env.APP_ORIGIN } = {}) {
  const app = express();
  let database = store;
  const db = () => database ||= createStore(); // No secrets/database access needed during builds.
  const sessionName = production ? '__Host-ganderson_session' : 'ganderson_session';
  const csrfName = production ? '__Host-ganderson_csrf' : 'ganderson_csrf';
  const cookieOptions = { httpOnly:true, secure:production, sameSite:'strict', path:'/' };
  app.disable('x-powered-by');
  app.use((req,res,next) => {
    if (!req.path.startsWith('/ganderson')) return next();
    res.set('X-Content-Type-Options','nosniff');
    res.set('Referrer-Policy','same-origin');
    res.set('Content-Security-Policy', "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    next();
  });
  app.use('/ganderson/api', express.json({ limit:'12kb' }), async (req,res,next) => {
    res.set('Cache-Control','no-store');
    const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(p=>p.trim().split('=')));
    req.sessionToken = cookies[sessionName];
    req.csrfToken = /^[a-f0-9]{64}$/.test(cookies[csrfName] || "") ? cookies[csrfName] : null;
    if (!['GET','HEAD'].includes(req.method)) {
      const expectedOrigin = origin || `${req.protocol}://${req.get('host')}`;
      if (req.get('origin') !== expectedOrigin || !cookies[csrfName] || req.get('x-csrf-token') !== cookies[csrfName])
        return res.status(403).json({ error:'Please refresh the page and try again.' });
      if (!req.is('application/json')) return res.status(415).json({ error:'JSON required.' });
    }
    try {
      req.user = req.sessionToken ? await db().getSession(digest(req.sessionToken)) : null;
      next();
    } catch(error) { next(error); }
  });
  const router = express.Router();
  router.get('/session', (req,res) => {
    const csrf = req.csrfToken || token();
    res.cookie(csrfName, csrf, {...cookieOptions, maxAge:8*60*60*1000});
    res.json({ user:req.user || null, csrf });
  });
  router.post('/login', async (req,res) => {
    const email = typeof req.body.user_email === 'string' ? req.body.user_email.trim().toLowerCase() : '';
    const password = req.body.user_password;
    if (!email || email.length>254 || typeof password!=='string' || password.length>128)
      return res.status(400).json({ error:'Enter your email and password.' });
    // Database-backed limits survive serverless restarts and are shared across instances.
    if (!await db().allowLogin(`email:${digest(email)}`)) return res.status(429).json({ error:'Too many attempts. Please wait 15 minutes.' });
    const user = await db().findUser(email);
    // Use a real scrypt operation even for missing accounts to reduce timing leakage.
    const dummy = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
    const valid = await verifyPassword(password, user?.password_hash || dummy);
    if (!user || !valid) return res.status(401).json({ error:'Email or password is incorrect.' });
    if (req.sessionToken) await db().deleteSession(digest(req.sessionToken));
    const raw = token();
    await db().createSession(digest(raw),user.user_id);
    res.cookie(sessionName,raw,{...cookieOptions,maxAge:8*60*60*1000});
    res.json({ ok:true });
  });
  router.post('/logout', async(req,res) => {
    if(req.sessionToken) await db().deleteSession(digest(req.sessionToken));
    res.clearCookie(sessionName,cookieOptions);
    res.clearCookie(csrfName,cookieOptions);
    res.json({ ok:true });
  });
  // Buttons are presentation only. Every maintenance endpoint enforces login here.
  router.use((req,res,next)=>req.user ? next() : res.status(401).json({error:'Please log in to maintain users and records.'}));
  const idValid = (req,res,next) => /^[1-9]\d{0,18}$/.test(req.params.id) && BigInt(req.params.id) <= 9223372036854775807n ? next() : res.status(400).json({error:'Invalid record ID.'});
  function userValues(body,editing) {
    const name = typeof body.user_name==='string' ? body.user_name.trim() : '';
    const email = typeof body.user_email==='string' ? body.user_email.trim().toLowerCase() : '';
    const password = body.user_password;
    if (!name || name.length>100 || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    if ((!editing || password) && !passwordValid(password)) return null;
    return [name,email,password];
  }
  router.get('/users',async(req,res)=>res.json(await db().listUsers()));
  router.post('/users',async(req,res)=>{
    const values = userValues(req.body,false);
    if(!values) return res.status(400).json({error:'Enter a name, valid email, and a password of 12–128 characters.'});
    res.status(201).json(await db().createUser(values[0],values[1],await hashPassword(values[2])));
  });
  router.put('/users/:id',idValid,async(req,res)=>{
    const values = userValues(req.body,true);
    if(!values) return res.status(400).json({error:'Enter a name and valid email. New passwords must be 12–128 characters.'});
    const user = await db().updateUser(req.params.id, values[0],values[1],values[2] ? await hashPassword(values[2]) : null);
    if(!user) return res.status(404).json({error:'User no longer exists. Refresh the list.'});
    res.json({ ...user, signedOut:!!values[2] && String(req.user.user_id)===req.params.id });
  });
  router.delete('/users/:id',idValid,async(req,res)=>{
    if(String(req.user.user_id)===req.params.id) return res.status(409).json({error:'You cannot delete the account you are signed in with.'});
    if(!await db().deleteUser(req.params.id)) return res.status(404).json({error:'User no longer exists.'});
    res.json({ok:true});
  });
  function recordValues(body) {
    const {title,description,lesson_topic,difficulty,estimated_minutes} = body;
    if(typeof title!=='string' || !title.trim() || title.trim().length>120 || typeof description!=='string' || !description.trim() || description.trim().length>2000 || !topics.includes(lesson_topic) || !difficulties.includes(difficulty) || !Number.isInteger(estimated_minutes) || estimated_minutes<1 || estimated_minutes>180) return null;
    return [title.trim(),description.trim(),lesson_topic,difficulty,estimated_minutes];
  }
  router.get('/records',async(req,res)=>res.json(await db().listRecords()));
  router.post('/records',async(req,res)=>{
    const values = recordValues(req.body);
    if(!values) return res.status(400).json({error:'Complete every field. Estimated time must be 1–180 whole minutes.'});
    res.status(201).json(await db().createRecord(values));
  });
  router.put('/records/:id',idValid,async(req,res)=>{
    const values=recordValues(req.body);
    if(!values) return res.status(400).json({error:'Complete every field. Estimated time must be 1–180 whole minutes.'});
    const record=await db().updateRecord(req.params.id,values);
    if(!record) return res.status(404).json({error:'Record no longer exists. Refresh the list.'});
    res.json(record);
  });
  router.delete('/records/:id',idValid,async(req,res)=>{
    if(!await db().deleteRecord(req.params.id)) return res.status(404).json({error:'Record no longer exists.'});
    res.json({ok:true});
  });
  router.use((req,res)=>res.status(404).json({error:'Page not found.'}));
  app.use('/ganderson/api',router);
  // Vercel serves public/ directly; Express also serves the same files locally.
  app.use('/ganderson',express.static(path.join(__dirname,'public'),{extensions:['html']}));
  app.use(express.static(path.join(__dirname,'..','public'),{extensions:['html']}));
  app.use((error,req,res,next)=>{
    if(error.code==='23505') return res.status(409).json({error:'That email is already in use.'});
    if(error.type==='entity.parse.failed') return res.status(400).json({error:'Invalid request.'});
    if(error.type==='entity.too.large') return res.status(413).json({error:'Request too large.'});
    console.error('Ganderson request failed',error.code || error.name);
    res.status(503).json({error:'The database is unavailable. Please try again shortly.'});
  });
  return app;
}
module.exports={ createApp };
