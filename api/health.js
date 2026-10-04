import { sendJson } from '../lib/http.js';
import { select } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false });
  try {
    const [leads, sales] = await Promise.all([
      select('leads', 'select=id&limit=1'),
      select('sales', 'select=id&limit=1')
    ]);
    return sendJson(res, 200, { ok: true, database: true, leads_access: Array.isArray(leads), sales_access: Array.isArray(sales) });
  } catch (error) {
    console.error('health', error);
    return sendJson(res, 500, { ok: false, database: false });
  }
}
