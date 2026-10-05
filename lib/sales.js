import { insert, patch, select } from './supabase.js';
import { findLeadById } from './leads.js';
import { findClientById } from './clients.js';
import { sendPurchaseToMeta } from './meta.js';

function enc(v) { return encodeURIComponent(v); }

export async function createSale({ leadId, amount, currency = null, paymentMethod = 'manual', paymentExternalId = null, soldAt = new Date().toISOString() }) {
  if (!leadId) throw new Error('leadId requerido');
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Monto inválido');

  const lead = await findLeadById(leadId);
  if (!lead) throw new Error('Lead no encontrado');

  const client = await findClientById(lead.client_id);
  if (!client) throw new Error('Cliente no encontrado');
  const saleCurrency = currency || client.currency || 'ARS';

  if (paymentExternalId) {
    const existing = await select('sales', `select=*&client_id=eq.${enc(client.id)}&payment_external_id=eq.${enc(paymentExternalId)}&limit=1`);
    if (existing?.[0]) return { sale: existing[0], duplicate: true };
  }

  const eventId = `agency_${leadId}_${paymentExternalId || Math.floor(new Date(soldAt).getTime()/1000)}`;
  const rows = await insert('sales', {
    client_id: client.id,
    lead_id: leadId,
    amount: value,
    currency: saleCurrency,
    payment_method: paymentMethod,
    payment_external_id: paymentExternalId,
    event_id: eventId,
    sold_at: soldAt,
    meta_status: lead.ctwa_clid ? 'pending' : 'not_applicable'
  });
  const sale = rows?.[0];

  await patch('leads', { id: `eq.${leadId}` }, {
    status: 'won',
    pipeline_stage: 'won',
    pipeline_updated_at: new Date().toISOString(),
    follow_up_at: null,
    updated_at: new Date().toISOString()
  });

  let meta = { skipped: true, reason: 'Lead sin ctwa_clid' };
  if (lead.ctwa_clid && sale) {
    try {
      meta = await sendPurchaseToMeta({
        ctwaClid: lead.ctwa_clid,
        amount: value,
        currency: saleCurrency,
        eventId
      }, client);
      await patch('sales', { id: `eq.${sale.id}` }, { meta_status: meta.skipped ? 'skipped' : 'sent', meta_response: meta });
    } catch (error) {
      meta = { error: error.message };
      await patch('sales', { id: `eq.${sale.id}` }, { meta_status: 'error', meta_response: meta });
    }
  }

  return { sale, lead, client, meta, duplicate: false };
}
