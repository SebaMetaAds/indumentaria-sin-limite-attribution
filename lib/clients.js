import { insert, patch, select } from './supabase.js';

function enc(v) { return encodeURIComponent(v); }

export async function listClients({ activeOnly = false } = {}) {
  let query = 'select=*&order=name.asc';
  if (activeOnly) query += '&status=eq.active';
  return select('clients', query);
}

export async function findClientById(id) {
  if (!id) return null;
  const rows = await select('clients', `select=*&id=eq.${enc(id)}&limit=1`);
  return rows?.[0] || null;
}

export async function findClientByWebhook({ wabaId, phoneNumberId }) {
  if (phoneNumberId) {
    const rows = await select('clients', `select=*&phone_number_id=eq.${enc(phoneNumberId)}&status=eq.active&limit=1`);
    if (rows?.[0]) return rows[0];
  }

  if (wabaId) {
    const rows = await select('clients', `select=*&waba_id=eq.${enc(wabaId)}&status=eq.active&limit=1`);
    if (rows?.[0]) return rows[0];
  }

  const active = await listClients({ activeOnly: true });
  return active?.length === 1 ? active[0] : null;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanPayload(body, { creating = false } = {}) {
  const allowed = [
    'name','slug','status','whatsapp_number','waba_id','phone_number_id',
    'ad_account_id','dataset_id','currency','meta_enabled','mp_enabled',
    'website_url','instagram_handle','monthly_ad_budget','business_goal','internal_notes','primary_contact_name'
  ];
  const payload = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body || {}, key)) payload[key] = body[key] === '' ? null : body[key];
  }
  if (creating) {
    if (!payload.name?.trim()) throw new Error('Nombre del cliente requerido');
    payload.name = payload.name.trim();
    payload.slug = slugify(payload.slug || payload.name);
    if (!payload.slug) throw new Error('Slug inválido');
    payload.status = payload.status || 'active';
    payload.currency = payload.currency || 'ARS';
  }
  payload.updated_at = new Date().toISOString();
  return payload;
}

export async function createClient(body) {
  const rows = await insert('clients', cleanPayload(body, { creating: true }));
  return rows?.[0] || null;
}

export async function updateClient(id, body) {
  if (!id) throw new Error('client id requerido');
  const payload = cleanPayload(body);
  delete payload.slug;
  const rows = await patch('clients', { id: `eq.${id}` }, payload);
  return rows?.[0] || null;
}
