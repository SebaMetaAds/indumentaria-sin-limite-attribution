function graphVersion() { return process.env.META_GRAPH_VERSION || 'v25.0'; }
function token() { return process.env.META_ACCESS_TOKEN; }

export async function getAdDetails(adId) {
  if (!adId || !token()) return null;
  const fields = 'id,name,adset{id,name},campaign{id,name}';
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${adId}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('access_token', token());
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

export function buildBusinessMessagingPurchase({ ctwaClid, amount, currency = 'ARS', eventId, eventTime = Math.floor(Date.now()/1000) }) {
  const wabaId = process.env.WABA_ID;
  if (!ctwaClid) throw new Error('Falta ctwa_clid');
  if (!wabaId) throw new Error('Falta WABA_ID');
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
    custom_data: {
      currency,
      value: Number(amount)
    }
  };
}

export async function sendPurchaseToMeta(args) {
  const datasetId = process.env.META_DATASET_ID;
  if (!datasetId || !token()) return { skipped: true, reason: 'META_DATASET_ID o META_ACCESS_TOKEN no configurados' };
  const event = buildBusinessMessagingPurchase(args);
  const payload = { data: [event] };
  if (process.env.META_CAPI_TEST_EVENT_CODE) payload.test_event_code = process.env.META_CAPI_TEST_EVENT_CODE;

  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${datasetId}/events`);
  url.searchParams.set('access_token', token());
  const res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.events_received === 0) {
    throw new Error(`Meta CAPI ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function getAdInsights(since, until) {
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!account || !token()) return [];
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${account}/insights`);
  url.searchParams.set('level', 'ad');
  url.searchParams.set('fields', 'spend,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name');
  url.searchParams.set('time_range', JSON.stringify({ since: since.slice(0,10), until: until.slice(0,10) }));
  url.searchParams.set('limit', '500');
  url.searchParams.set('access_token', token());
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}
