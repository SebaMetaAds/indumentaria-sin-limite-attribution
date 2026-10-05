import { sendJson, readJsonBody, requireAdmin } from '../lib/http.js';
import { createClient, listClients, updateClient } from '../lib/clients.js';
import { hasClientMetaToken, setClientMetaToken } from '../lib/credentials.js';

async function withTokenStatus(clients) {
  return Promise.all((clients || []).map(async c => ({
    ...c,
    meta_token_configured: await hasClientMetaToken(c.id)
  })));
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method === 'GET') {
      return sendJson(res, 200, { clients: await withTokenStatus(await listClients()) });
    }
    if (req.method === 'POST') {
      const body = readJsonBody(req);
      const client = await createClient(body);
      if (body.meta_access_token) await setClientMetaToken(client.id, body.meta_access_token);
      return sendJson(res, 201, { client: { ...client, meta_token_configured: Boolean(body.meta_access_token) } });
    }
    if (req.method === 'PATCH') {
      const body = readJsonBody(req);
      const client = await updateClient(body.id, body);
      if (body.meta_access_token) await setClientMetaToken(body.id, body.meta_access_token);
      return sendJson(res, 200, {
        client: {
          ...client,
          meta_token_configured: await hasClientMetaToken(body.id)
        }
      });
    }
    return sendJson(res, 405, { error: 'Método no permitido' });
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
}
