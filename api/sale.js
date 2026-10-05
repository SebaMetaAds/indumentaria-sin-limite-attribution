import { sendJson, readJsonBody, requireAdmin } from '../lib/http.js';
import { createSale } from '../lib/sales.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método no permitido' });
  try {
    const body = readJsonBody(req);
    const result = await createSale({
      leadId: body.leadId,
      amount: body.amount,
      currency: body.currency || null,
      paymentMethod: body.paymentMethod || 'manual'
    });
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
}
