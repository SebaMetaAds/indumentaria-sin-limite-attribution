import crypto from 'node:crypto';

function secret() {
  return process.env.CLIENT_SECRET_MASTER_KEY || process.env.DASHBOARD_PASSWORD || '';
}

function signature(id, expires) {
  return crypto.createHmac('sha256', secret()).update(`${id}:${expires}`).digest('hex');
}

export function signedMediaUrl(messageId, ttlSeconds = 900) {
  if (!messageId || !secret()) return null;
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = signature(messageId, expires);
  return `/api/media?id=${encodeURIComponent(messageId)}&expires=${expires}&sig=${sig}`;
}

export function verifyMediaSignature(messageId, expires, sig) {
  if (!messageId || !expires || !sig || !secret()) return false;
  const exp = Number(expires);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = signature(messageId, exp);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
