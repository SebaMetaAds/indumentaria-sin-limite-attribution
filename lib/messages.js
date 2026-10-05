import { insert, patch, select } from './supabase.js';
import { detectPaymentSignal } from './payment-signals.js';

function enc(v) { return encodeURIComponent(v); }

export async function recordInboundMessage(msg, lead) {
  if (!lead?.id || !lead?.client_id || !msg?.message_id) return null;

  const receivedAt = msg.timestamp || new Date().toISOString();
  const rows = await insert('messages', {
    client_id: lead.client_id,
    lead_id: lead.id,
    message_id: msg.message_id,
    direction: 'inbound',
    message_type: msg.message_type || null,
    message_text: msg.message_text || null,
    media_id: msg.media_id || null,
    media_mime_type: msg.media_mime_type || null,
    media_sha256: msg.media_sha256 || null,
    media_filename: msg.media_filename || null,
    received_at: receivedAt
  }, {
    onConflict: 'client_id,message_id',
    resolution: 'ignore-duplicates'
  });

  const paymentSignal = rows?.length ? detectPaymentSignal(msg.message_text) : null;
  if (paymentSignal) {
    await patch('leads', { id: `eq.${lead.id}` }, {
      payment_signal_detected_at: receivedAt,
      payment_signal_type: paymentSignal.type,
      payment_signal_text: paymentSignal.text,
      payment_signal_message_id: msg.message_id,
      alias_detected_at: paymentSignal.type === 'alias' ? receivedAt : lead.alias_detected_at || null,
      payment_check_status: lead.payment_check_status === 'paid' ? 'paid' : 'pending',
      payment_checked_at: lead.payment_check_status === 'paid' ? lead.payment_checked_at || null : null,
      updated_at: new Date().toISOString()
    });
  }

  return rows?.[0] || null;
}

export async function getMessagesForClient(clientId, since, until) {
  return select(
    'messages',
    `select=*&client_id=eq.${enc(clientId)}&received_at=gte.${enc(since)}&received_at=lte.${enc(until)}&order=received_at.asc&limit=3000`
  );
}
