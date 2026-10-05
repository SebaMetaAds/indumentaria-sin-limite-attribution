import { sendJson } from '../lib/http.js';
import { select } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false });
  try {
    const [clients, leads, sales, messages] = await Promise.all([
      select('clients', 'select=id&limit=2'),
      select('leads', 'select=id,client_id&limit=1'),
      select('sales', 'select=id,client_id&limit=1'),
      select('messages', 'select=id,client_id,lead_id&limit=1')
    ]);
    return sendJson(res, 200, {
      ok: true,
      database: true,
      multi_client: true,
      clients_access: Array.isArray(clients),
      clients_count_sample: Array.isArray(clients) ? clients.length : 0,
      leads_access: Array.isArray(leads),
      sales_access: Array.isArray(sales),
      messages_access: Array.isArray(messages)
    });
  } catch (error) {
    console.error('health', error);
    return sendJson(res, 500, { ok: false, database: false, multi_client: false });
  }
}
