import { insert, patch, select } from './supabase.js';
import { findLeadById } from './leads.js';
import { sendPurchaseToMeta } from './meta.js';

function enc(v) { return encodeURIComponent(v); }

export async function createSale({ leadId, amount, currency = 'ARS', paymentMethod = 'manual', paymentExternalId = null, soldAt = new Date().toISOString() }) {
  if (!leadId) throw new Error('leadId requerido');
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Monto inválido');

  if (paymentExternalId) {
    const existing = await select('sales', `select=*&payment_external_id=eq.${enc(paymentExternalId)}&limit=1`);
    if (existing?.[0]) return { sale: existing[0], duplicate: true };
  }

  const lead = await findLeadById(leadId);
  if (!lead) throw new Error('Lead no encontrado');

  const eventId = `isl_${leadId}_${paymentExternalId || Math.floor(new Date(soldAt).getTime()/1000)}`;
  const rows = await insert('sales', {
    lead_id: leadId,
    amount: value,
    currency,
    payment_method: paymentMethod,
    payment_external_id: paymentExternalId,
    event_id: eventId,
    sold_at: soldAt,
    meta_status: lead.ctwa_clid ? 'pending' : 'not_applicable'
  });
  const sale = rows?.[0];

  await patch('leads', { id: `eq.${leadId}` }, { status: 'won', updated_at: new Date().toISOString() });

  let meta = { skipped: true, reason: 'Lead sin ctwa_clid' };
  if (lead.ctwa_clid && sale) {
    try {
      meta = await sendPurchaseToMeta({
        ctwaClid: lead.ctwa_clid,
        amount: value,
        currency,
        eventId
      });
      await patch('sales', { id: `eq.${sale.id}` }, { meta_status: meta.skipped ? 'skipped' : 'sent', meta_response: meta });
    } catch (error) {
      meta = { error: error.message };
      await patch('sales', { id: `eq.${sale.id}` }, { meta_status: 'error', meta_response: meta });
    }
  }

  return { sale, lead, meta, duplicate: false };
}
