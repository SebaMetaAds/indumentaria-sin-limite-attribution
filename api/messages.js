import { sendJson, readJsonBody, requireAdmin, isoRange } from '../lib/http.js';
import { patch, select } from '../lib/supabase.js';
import { getMessagesForClient } from '../lib/messages.js';
import { signedMediaUrl } from '../lib/media.js';
import { analyzeConversation } from '../lib/ai-analysis.js';

function enc(v) { return encodeURIComponent(v); }

function withMediaUrls(messages) {
  return (messages || []).map(m => ({
    ...m,
    media_url: m.media_id ? signedMediaUrl(m.id) : null
  }));
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query?.ai_test_token && req.query.ai_test_token === process.env.AI_TEST_TOKEN) {
    try {
      const analysis = await analyzeConversation({
        lead: { status: 'open', meta_campaign_name: 'Prueba interna', meta_ad_name: 'Prueba IA' },
        messages: [
          { direction: 'inbound', message_text: 'Hola, tienen talle 42 y hacen envíos a CABA?' },
          { direction: 'outbound', message_text: 'Sí, tenemos talle 42 y enviamos a CABA.' },
          { direction: 'inbound', message_text: 'Buenísimo, cuánto sale y puedo pagar al recibir?' }
        ]
      });
      return sendJson(res, 200, { ok: true, analysis });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message });
    }
  }
  if (!requireAdmin(req, res)) return;
  if (!['GET','POST'].includes(req.method)) return sendJson(res, 405, { error: 'Método no permitido' });

  try {
    if (req.method === 'POST') {
      const body = readJsonBody(req);
      if (body.action !== 'analyze') return sendJson(res, 400, { error: 'Acción no soportada' });
      const leadId = body.lead_id || body.leadId;
      if (!leadId) return sendJson(res, 400, { error: 'lead_id requerido' });

      const leadRows = await select('leads', `select=*&id=eq.${enc(leadId)}&limit=1`);
      const lead = leadRows?.[0];
      if (!lead) return sendJson(res, 404, { error: 'Conversación no encontrada' });
      const messages = await select('messages', `select=*&lead_id=eq.${enc(leadId)}&order=received_at.asc&limit=3000`);
      const analysis = await analyzeConversation({ lead, messages });
      const now = new Date().toISOString();

      const rows = await patch('leads', { id: `eq.${leadId}` }, {
        ai_summary: analysis.summary,
        ai_intent: analysis.intent,
        ai_score: analysis.score,
        ai_products: analysis.products,
        ai_objections: analysis.objections,
        ai_next_action: analysis.next_action,
        ai_sentiment: analysis.sentiment,
        ai_requires_attention: analysis.requires_attention,
        ai_analyzed_at: now,
        ai_model: analysis.model,
        ai_message_count: analysis.message_count,
        updated_at: now
      });

      return sendJson(res, 200, { analysis, lead: rows?.[0] || lead });
    }

    const leadId = req.query?.lead_id;
    if (leadId) {
      const leadRows = await select('leads', `select=id,client_id,phone,contact_name,status,source,ctwa_clid,meta_campaign_name,meta_adset_name,meta_ad_name,meta_ad_id,referral_headline,first_message_at,last_message_at,pipeline_stage,assigned_to,follow_up_at,ai_summary,ai_intent,ai_score,ai_products,ai_objections,ai_next_action,ai_sentiment,ai_requires_attention,ai_analyzed_at,ai_model,ai_message_count&id=eq.${enc(leadId)}&limit=1`);
      const lead = leadRows?.[0];
      if (!lead) return sendJson(res, 404, { error: 'Conversación no encontrada' });

      const messages = await select('messages', `select=*&lead_id=eq.${enc(leadId)}&order=received_at.asc&limit=3000`);
      return sendJson(res, 200, {
        lead,
        messages: withMediaUrls(messages),
        total_messages: (messages || []).length
      });
    }

    const clientId = req.query?.client_id;
    const adId = req.query?.ad_id;
    if (!clientId || !adId) return sendJson(res, 400, { error: 'lead_id o client_id + ad_id son requeridos' });

    const { since, until, days } = isoRange(req.query || {});
    let leadQuery = `select=id,phone,contact_name,status,ctwa_clid,meta_campaign_name,meta_adset_name,meta_ad_name,meta_ad_id,first_message_at,last_message_at&client_id=eq.${enc(clientId)}&first_message_at=gte.${enc(since)}&first_message_at=lte.${enc(until)}&order=first_message_at.desc&limit=1000`;

    if (adId === 'sin_ad') leadQuery += '&meta_ad_id=is.null';
    else leadQuery += `&meta_ad_id=eq.${enc(adId)}`;

    const [leads, messages] = await Promise.all([
      select('leads', leadQuery),
      getMessagesForClient(clientId, since, until)
    ]);

    const leadIds = new Set((leads || []).map(l => l.id));
    const byLead = new Map();
    for (const m of messages || []) {
      if (!leadIds.has(m.lead_id)) continue;
      const arr = byLead.get(m.lead_id) || [];
      arr.push(m);
      byLead.set(m.lead_id, arr);
    }

    const conversations = (leads || []).map(lead => ({
      ...lead,
      messages: withMediaUrls(byLead.get(lead.id) || [])
    })).filter(x => x.messages.length > 0);

    return sendJson(res, 200, {
      range: { since, until, days },
      client_id: clientId,
      ad_id: adId,
      conversations,
      total_conversations: conversations.length,
      total_messages: conversations.reduce((acc, c) => acc + c.messages.length, 0)
    });
  } catch (error) {
    console.error('messages', error);
    return sendJson(res, 500, { error: error.message });
  }
}
