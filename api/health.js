import { sendJson } from '../lib/http.js';
import { select } from '../lib/supabase.js';
import { listClients } from '../lib/clients.js';
import { getWhatsAppCoexistenceStatus } from '../lib/meta.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false });
  try {
    const [clients, leads, sales, messages, clientRows] = await Promise.all([
      select('clients', 'select=id&limit=2'),
      select('leads', 'select=id,client_id&limit=1'),
      select('sales', 'select=id,client_id&limit=1'),
      select('messages', 'select=id,client_id,lead_id&limit=1'),
      listClients({ activeOnly: true })
    ]);
    let whatsapp_platform = null;
    const primary = clientRows?.find(c => c.slug === 'indumentaria-sin-limite') || clientRows?.[0];
    if (primary?.phone_number_id) {
      try {
        const s = await getWhatsAppCoexistenceStatus(primary);
        whatsapp_platform = {
          is_on_biz_app: s?.is_on_biz_app ?? null,
          platform_type: s?.platform_type ?? null
        };
      } catch (e) {
        whatsapp_platform = { error: e.message };
      }
    }
    return sendJson(res, 200, {
      ok: true,
      database: true,
      multi_client: true,
      clients_access: Array.isArray(clients),
      clients_count_sample: Array.isArray(clients) ? clients.length : 0,
      leads_access: Array.isArray(leads),
      sales_access: Array.isArray(sales),
      messages_access: Array.isArray(messages),
      whatsapp_platform
    });
  } catch (error) {
    console.error('health', error);
    return sendJson(res, 500, { ok: false, database: false, multi_client: false });
  }
}
