import crypto from 'node:crypto';

export function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret) return true;
  if (!rawBody || !signatureHeader?.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function extractMessages(body) {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const contacts = new Map((value.contacts || []).map(c => [c.wa_id, c]));
      for (const m of value.messages || []) {
        const referral = m.referral || null;
        const contact = contacts.get(m.from);
        out.push({
          phone: m.from || null,
          contact_name: contact?.profile?.name || null,
          message_id: m.id || null,
          message_type: m.type || null,
          message_text: m.text?.body || null,
          timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
          referral: referral ? {
            ctwa_clid: referral.ctwa_clid || null,
            source_id: referral.source_id || null,
            source_url: referral.source_url || null,
            source_type: referral.source_type || null,
            headline: referral.headline || null,
            body: referral.body || null
          } : null
        });
      }
    }
  }
  return out;
}
