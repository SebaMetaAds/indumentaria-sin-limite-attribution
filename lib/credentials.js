import crypto from 'node:crypto';
import { insert, select } from './supabase.js';

function enc(v) { return encodeURIComponent(v); }

function key() {
  const master = process.env.CLIENT_SECRET_MASTER_KEY;
  if (!master) throw new Error('CLIENT_SECRET_MASTER_KEY no configurada');
  return crypto.createHash('sha256').update(master).digest();
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(x => x.toString('base64url')).join('.');
}

function decrypt(payload) {
  if (!payload) return null;
  const [ivB64, tagB64, dataB64] = String(payload).split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Credencial cifrada inválida');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

export async function setClientMetaToken(clientId, token) {
  if (!clientId) throw new Error('clientId requerido');
  if (!token || String(token).trim().length < 20) throw new Error('Token de Meta inválido');
  const rows = await insert('client_credentials', {
    client_id: clientId,
    meta_access_token_enc: encrypt(String(token).trim()),
    updated_at: new Date().toISOString()
  }, { onConflict: 'client_id', resolution: 'merge-duplicates' });
  return Boolean(rows?.[0]);
}

export async function getClientMetaToken(clientId) {
  if (!clientId) return null;
  const rows = await select('client_credentials', `select=meta_access_token_enc&client_id=eq.${enc(clientId)}&limit=1`);
  const encrypted = rows?.[0]?.meta_access_token_enc;
  return encrypted ? decrypt(encrypted) : null;
}

export async function hasClientMetaToken(clientId) {
  if (!clientId) return false;
  const rows = await select('client_credentials', `select=client_id&client_id=eq.${enc(clientId)}&meta_access_token_enc=not.is.null&limit=1`);
  return Boolean(rows?.[0]);
}
