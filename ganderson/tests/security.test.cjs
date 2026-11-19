const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, passwordValid, token, digest } = require('../security.cjs');
test('password hashes are salted, verifiable, and reject a wrong password',async()=>{
  const a=await hashPassword('a-long-test-password'); const b=await hashPassword('a-long-test-password');
  assert.notEqual(a,b); assert(!a.includes('a-long-test-password'));
  assert(await verifyPassword('a-long-test-password',a));
  assert(!await verifyPassword('wrong-password',a));
  assert(!await verifyPassword('a-long-test-password','invalid'));
});
test('password bounds and opaque session tokens',()=>{
  assert(!passwordValid('test'));assert(passwordValid('x'.repeat(12)));assert(!passwordValid('x'.repeat(129)));
  assert(!passwordValid({length:20})); assert.match(token(),/^[a-f0-9]{64}$/); assert.notEqual(token(),token());assert.equal(digest(token()).length,64);
});
