import { sendJson, readJsonBody, requireAdmin } from '../lib/http.js';
import { createClient, listClients, updateClient } from '../lib/clients.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method === 'GET') {
      return sendJson(res, 200, { clients: await listClients() });
    }
    if (req.method === 'POST') {
      const client = await createClient(readJsonBody(req));
      return sendJson(res, 201, { client });
    }
    if (req.method === 'PATCH') {
      const body = readJsonBody(req);
      const client = await updateClient(body.id, body);
      return sendJson(res, 200, { client });
    }
    return sendJson(res, 405, { error: 'Método no permitido' });
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
}
