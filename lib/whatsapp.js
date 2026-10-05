import crypto from 'node:crypto';

export function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret) return true;
  if (!rawBody || !signatureHeader?.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function messageContent(m) {
  if (m?.text?.body) return m.text.body;
  if (m?.image?.caption) return m.image.caption;
  if (m?.video?.caption) return m.video.caption;
  if (m?.document?.caption) return m.document.caption;
  if (m?.button?.text) return m.button.text;
  if (m?.interactive?.button_reply?.title) return m.interactive.button_reply.title;
  if (m?.interactive?.list_reply?.title) return m.interactive.list_reply.title;
  return null;
}

function messageMedia(m) {
  const payload = m?.[m?.type];
  if (!payload || !['image','video','audio','document','sticker'].includes(m?.type)) {
    return { media_id: null, media_mime_type: null, media_sha256: null, media_filename: null };
  }
  return {
    media_id: payload.id || null,
    media_mime_type: payload.mime_type || null,
    media_sha256: payload.sha256 || null,
    media_filename: payload.filename || null
  };
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
        const media = messageMedia(m);
        out.push({
          waba_id: entry?.id || null,
          phone_number_id: value?.metadata?.phone_number_id || null,
          display_phone_number: value?.metadata?.display_phone_number || null,
          phone: m.from || null,
          contact_name: contact?.profile?.name || null,
          message_id: m.id || null,
          message_type: m.type || null,
          message_text: messageContent(m),
          ...media,
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
