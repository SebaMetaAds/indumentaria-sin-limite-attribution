import { sendJson, readJsonBody, requireAdmin } from '../lib/http.js';
import { createSale } from '../lib/sales.js';
import { findLeadById } from '../lib/leads.js';
import { patch } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método no permitido' });
  try {
    const body = readJsonBody(req);
    if (!body.leadId) throw new Error('leadId requerido');

    const hasAmount = body.amount !== undefined && body.amount !== null && String(body.amount).trim() !== '';
    if (!hasAmount) {
      const lead = await findLeadById(body.leadId);
      if (!lead) throw new Error('Lead no encontrado');
      if (lead.status === 'won') return sendJson(res, 200, { lead, marked: true, duplicate: true });
      const rows = await patch('leads', { id: `eq.${body.leadId}` }, {
        status: 'won',
        pipeline_stage: 'won',
        pipeline_updated_at: new Date().toISOString(),
        follow_up_at: null,
        updated_at: new Date().toISOString()
      });
      return sendJson(res, 200, { lead: rows?.[0] || lead, marked: true, duplicate: false });
    }

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
