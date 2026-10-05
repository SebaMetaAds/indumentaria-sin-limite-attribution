import { getClientMetaToken } from './credentials.js';

function graphVersion() { return process.env.META_GRAPH_VERSION || 'v25.0'; }

function fallbackForDefault(client, envName) {
  if (client?.slug === 'indumentaria-sin-limite') return process.env[envName] || null;
  return null;
}

export function clientMetaConfig(client) {
  return {
    adAccountId: client?.ad_account_id || fallbackForDefault(client, 'META_AD_ACCOUNT_ID'),
    datasetId: client?.dataset_id || fallbackForDefault(client, 'META_DATASET_ID'),
    wabaId: client?.waba_id || fallbackForDefault(client, 'WABA_ID')
  };
}

async function clientToken(client) {
  const stored = await getClientMetaToken(client?.id);
  return stored || (client?.slug === 'indumentaria-sin-limite' ? process.env.META_ACCESS_TOKEN || null : null);
}

export async function getAdDetails(adId, client) {
  const accessToken = await clientToken(client);
  if (!adId || !accessToken) return null;
  const fields = 'id,name,adset{id,name},campaign{id,name}';
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${adId}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('access_token', accessToken);
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

export function buildBusinessMessagingPurchase({ ctwaClid, amount, currency = 'ARS', eventId, wabaId, eventTime = Math.floor(Date.now()/1000) }) {
  if (!ctwaClid) throw new Error('Falta ctwa_clid');
  if (!wabaId) throw new Error('Falta WABA ID');
  return {
    event_name: 'Purchase',
    event_time: eventTime,
    event_id: eventId,
    action_source: 'business_messaging',
    messaging_channel: 'whatsapp',
    user_data: {
      whatsapp_business_account_id: wabaId,
      ctwa_clid: ctwaClid
    },
    custom_data: { currency, value: Number(amount) }
  };
}

export async function sendPurchaseToMeta(args, client) {
  const config = clientMetaConfig(client);
  const accessToken = await clientToken(client);
  if (!client?.meta_enabled) return { skipped: true, reason: 'Meta desactivado para este cliente' };
  if (!config.datasetId || !config.wabaId || !accessToken) {
    return { skipped: true, reason: 'Dataset, WABA o token Meta no configurados' };
  }
  const event = buildBusinessMessagingPurchase({ ...args, wabaId: config.wabaId });
  const payload = { data: [event] };
  if (process.env.META_CAPI_TEST_EVENT_CODE) payload.test_event_code = process.env.META_CAPI_TEST_EVENT_CODE;
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${config.datasetId}/events`);
  url.searchParams.set('access_token', accessToken);
  const res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.events_received === 0) throw new Error(`Meta CAPI ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

export async function getAdInsights(since, until, client) {
  if (!client?.meta_enabled) return [];
  const accessToken = await clientToken(client);
  const { adAccountId } = clientMetaConfig(client);
  if (!adAccountId || !accessToken) return [];

  const account = String(adAccountId).startsWith('act_') ? String(adAccountId) : `act_${adAccountId}`;
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${account}/insights`);
  url.searchParams.set('level', 'ad');
  url.searchParams.set('fields', 'spend,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name');
  url.searchParams.set('time_range', JSON.stringify({ since: since.slice(0,10), until: until.slice(0,10) }));
  url.searchParams.set('limit', '500');
  url.searchParams.set('access_token', accessToken);
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

export async function ensureClientDataset(client) {
  const accessToken = await clientToken(client);
  const { wabaId } = clientMetaConfig(client);
  if (!wabaId) throw new Error('Falta WABA ID');
  if (!accessToken) throw new Error('Falta token Meta');

  const endpoint = `https://graph.facebook.com/${graphVersion()}/${wabaId}/dataset`;

  const getUrl = new URL(endpoint);
  getUrl.searchParams.set('access_token', accessToken);
  const getRes = await fetch(getUrl);
  if (getRes.ok) {
    const existing = await getRes.json().catch(() => ({}));
    const existingId = existing?.id || existing?.dataset_id || existing?.data?.[0]?.id || existing?.data?.id;
    if (existingId) return String(existingId);
  }

  const postUrl = new URL(endpoint);
  postUrl.searchParams.set('access_token', accessToken);
  const postRes = await fetch(postUrl, { method: 'POST' });
  const created = await postRes.json().catch(() => ({}));
  if (!postRes.ok) throw new Error(`Meta dataset ${postRes.status}: ${JSON.stringify(created)}`);

  const datasetId = created?.id || created?.dataset_id || created?.data?.[0]?.id || created?.data?.id;
  if (!datasetId) throw new Error(`Meta no devolvió Dataset ID: ${JSON.stringify(created)}`);
  return String(datasetId);
}

export async function hasMetaToken(client) {
  return Boolean(await clientToken(client));
}
