const { randomBytes, scrypt: scryptCallback, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(scryptCallback);
const digest = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('hex');
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
async function verifyPassword(password, saved) {
  const [method, salt, hex] = (saved || '').split(':');
  if (method !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/.test(hex || '')) return false;
  const expected = Buffer.from(hex, 'hex');
  return timingSafeEqual(await scrypt(password, salt, 64), expected);
}
function passwordValid(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}
module.exports = { digest, token, hashPassword, verifyPassword, passwordValid };
