import { insert, select } from './supabase.js';

function enc(v) { return encodeURIComponent(v); }

export async function recordInboundMessage(msg, lead) {
  if (!lead?.id || !lead?.client_id || !msg?.message_id) return null;

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
    received_at: msg.timestamp || new Date().toISOString()
  }, {
    onConflict: 'client_id,message_id',
    resolution: 'ignore-duplicates'
  });

  return rows?.[0] || null;
}

export async function getMessagesForClient(clientId, since, until) {
  return select(
    'messages',
    `select=*&client_id=eq.${enc(clientId)}&received_at=gte.${enc(since)}&received_at=lte.${enc(until)}&order=received_at.asc&limit=3000`
  );
}
