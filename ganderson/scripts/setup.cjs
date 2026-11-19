// Bootstrap a grading account without putting its password in Git or command history.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { Writable } = require('node:stream');
const { createStore } = require('../store.cjs');
const { hashPassword, passwordValid } = require('../security.cjs');
async function main() {
  const store = createStore();
  let muted = false;
  const output = new Writable({write(chunk,encoding,done){if(!muted) process.stdout.write(chunk);done();}});
  const prompt = readline.createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
  try {
    const name = (await prompt.question('Grading account name: ')).trim();
    const email = (await prompt.question('Grading account email: ')).trim().toLowerCase();
    process.stdout.write('Password (12–128 characters, hidden): '); muted = true;
    const password = await prompt.question(''); muted = false; process.stdout.write('\n');
    if(!name || name.length>100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || !passwordValid(password)) throw new Error('Enter a valid name, email, and a password of 12–128 characters.');
    // Additive migration. An existing account is never reset or overwritten.
    await store.query(fs.readFileSync(path.join(__dirname,'..','schema.sql'),'utf8'));
    if(await store.findUser(email)) throw new Error('This account already exists. Use Maintain Users to edit it.');
    await store.createUser(name,email,await hashPassword(password));
    const [{count}] = await store.query('select count(*) from ganderson.records');
    if(Number(count)===0) {
      for(const values of [
        ['Start a short conversation','Ask someone a genuine, open-ended question and listen to their answer.','Confidence','Easy',5],
        ['Send a thoughtful follow-up','Write a brief text that refers to something you discussed together.','Texting','Easy',5],
        ['Plan a clear invitation','Choose a public place and a specific time, then practice a simple invitation.','Invitations','Medium',10]
      ]) await store.createRecord(values);
    }
    console.log('Ganderson tables, grading account, and starter records are ready. Save the credentials privately for the TAs.');
  } finally { muted=false;prompt.close();await store.close(); }
}
main().catch(error=>{console.error(error.code ? `Setup failed (${error.code}). Check the database connection and permissions.` : error.message);process.exitCode=1;});
