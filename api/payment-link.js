import { sendJson, readJsonBody, requireAdmin } from '../lib/http.js';
import { findLeadById } from '../lib/leads.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método no permitido' });
  try {
    if (!process.env.MP_ACCESS_TOKEN) throw new Error('MP_ACCESS_TOKEN no configurado');
    const body = readJsonBody(req);
    const lead = await findLeadById(body.leadId);
    if (!lead) throw new Error('Lead no encontrado');
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Monto inválido');
    const base = process.env.PUBLIC_BASE_URL;
    if (!base) throw new Error('PUBLIC_BASE_URL no configurada');

    const payload = {
      items: [{
        title: body.description || 'Compra IndumentariaSinLimite',
        quantity: 1,
        currency_id: 'ARS',
        unit_price: amount
      }],
      external_reference: lead.id,
      metadata: { lead_id: lead.id, phone: lead.phone },
      notification_url: `${base.replace(/\/$/, '')}/api/mercadopago-webhook`
    };
    const mp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await mp.json();
    if (!mp.ok) throw new Error(`Mercado Pago ${mp.status}: ${JSON.stringify(data)}`);
    return sendJson(res, 200, { id: data.id, url: data.init_point, sandbox_url: data.sandbox_init_point });
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
}
