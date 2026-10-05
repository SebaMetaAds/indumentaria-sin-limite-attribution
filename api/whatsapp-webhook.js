import { sendJson, readJsonBody } from '../lib/http.js';
import { extractMessages } from '../lib/whatsapp.js';
import { captureInboundMessage } from '../lib/leads.js';
import { recordInboundMessage } from '../lib/messages.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query?.['hub.mode'];
    const token = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send('Forbidden');
    return;
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método no permitido' });

  try {
    const body = readJsonBody(req);
    const messages = extractMessages(body);
    const captured = [];
    const errors = [];

    for (const msg of messages) {
      if (!msg.phone) continue;
      try {
        const lead = await captureInboundMessage(msg);
        if (lead) {
          await recordInboundMessage(msg, lead);
          captured.push(lead.id);
        }
      } catch (error) {
        console.error('whatsapp message capture', {
          waba_id: msg.waba_id,
          phone_number_id: msg.phone_number_id,
          error: error.message
        });
        errors.push({
          waba_id: msg.waba_id || null,
          phone_number_id: msg.phone_number_id || null,
          error: error.message
        });
      }
    }

    return sendJson(res, 200, {
      ok: true,
      messages: messages.length,
      captured: captured.length,
      errors: errors.length
    });
  } catch (error) {
    console.error('whatsapp-webhook', error);
    return sendJson(res, 200, { ok: true, warning: error.message });
  }
}
