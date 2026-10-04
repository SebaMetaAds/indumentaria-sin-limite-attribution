import { insert, patch, select } from './supabase.js';
import { getAdDetails } from './meta.js';

function enc(v) { return encodeURIComponent(v); }

export async function findLatestLeadByPhone(phone) {
  const rows = await select('leads', `select=*&phone=eq.${enc(phone)}&order=last_message_at.desc&limit=1`);
  return rows?.[0] || null;
}

export async function findLeadById(id) {
  const rows = await select('leads', `select=*&id=eq.${enc(id)}&limit=1`);
  return rows?.[0] || null;
}

export async function captureInboundMessage(msg) {
  const now = msg.timestamp || new Date().toISOString();
  const r = msg.referral;
  let lead = null;

  if (r?.ctwa_clid) {
    const existing = await select('leads', `select=*&ctwa_clid=eq.${enc(r.ctwa_clid)}&limit=1`);
    lead = existing?.[0] || null;
    const ad = await getAdDetails(r.source_id);
    const payload = {
      phone: msg.phone,
      contact_name: msg.contact_name,
      source: 'meta_whatsapp_ad',
      ctwa_clid: r.ctwa_clid,
      meta_ad_id: r.source_id || ad?.id || null,
      meta_ad_name: ad?.name || null,
      meta_adset_id: ad?.adset?.id || null,
      meta_adset_name: ad?.adset?.name || null,
      meta_campaign_id: ad?.campaign?.id || null,
      meta_campaign_name: ad?.campaign?.name || null,
      referral_url: r.source_url,
      referral_headline: r.headline,
      referral_body: r.body,
      first_message_at: lead?.first_message_at || now,
      last_message_at: now,
      last_message_text: msg.message_text,
      last_message_id: msg.message_id,
      updated_at: new Date().toISOString()
    };
    if (lead) {
      const rows = await patch('leads', { id: `eq.${lead.id}` }, payload);
      return rows?.[0] || { ...lead, ...payload };
    }
    const rows = await insert('leads', payload);
    return rows?.[0];
  }

  lead = await findLatestLeadByPhone(msg.phone);
  if (lead) {
    const rows = await patch('leads', { id: `eq.${lead.id}` }, {
      contact_name: msg.contact_name || lead.contact_name,
      last_message_at: now,
      last_message_text: msg.message_text,
      last_message_id: msg.message_id,
      updated_at: new Date().toISOString()
    });
    return rows?.[0] || lead;
  }

  const rows = await insert('leads', {
    phone: msg.phone,
    contact_name: msg.contact_name,
    source: 'organic_whatsapp',
    first_message_at: now,
    last_message_at: now,
    last_message_text: msg.message_text,
    last_message_id: msg.message_id
  });
  return rows?.[0];
}
