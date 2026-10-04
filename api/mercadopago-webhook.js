import { sendJson, readJsonBody } from '../lib/http.js';
import { createSale } from '../lib/sales.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 200, { ok: true });
  try {
    const body = readJsonBody(req);
    const paymentId = body?.data?.id || req.query?.['data.id'];
    if (!paymentId || !process.env.MP_ACCESS_TOKEN) return sendJson(res, 200, { ok: true, ignored: true });

    const mp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const payment = await mp.json();
    if (!mp.ok) return sendJson(res, 200, { ok: true, ignored: true });
    if (payment.status !== 'approved') return sendJson(res, 200, { ok: true, status: payment.status });
    if (!payment.external_reference) return sendJson(res, 200, { ok: true, ignored: 'sin external_reference' });

    const result = await createSale({
      leadId: payment.external_reference,
      amount: payment.transaction_amount,
      currency: payment.currency_id || 'ARS',
      paymentMethod: 'mercadopago',
      paymentExternalId: String(payment.id),
      soldAt: payment.date_approved || new Date().toISOString()
    });
    return sendJson(res, 200, { ok: true, duplicate: result.duplicate, sale_id: result.sale?.id });
  } catch (error) {
    console.error('mercadopago-webhook', error);
    return sendJson(res, 200, { ok: true, warning: error.message });
  }
}
