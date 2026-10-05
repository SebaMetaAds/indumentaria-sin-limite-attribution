import { select } from '../lib/supabase.js';
import { findClientById } from '../lib/clients.js';
import { fetchWhatsAppMedia } from '../lib/meta.js';
import { verifyMediaSignature } from '../lib/media.js';

function enc(v) { return encodeURIComponent(v); }

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).end('Method Not Allowed');
    return;
  }

  const id = req.query?.id;
  const expires = req.query?.expires;
  const sig = req.query?.sig;

  if (!verifyMediaSignature(id, expires, sig)) {
    res.status(403).end('Forbidden');
    return;
  }

  try {
    const rows = await select('messages', `select=id,client_id,media_id,media_mime_type,media_filename&id=eq.${enc(id)}&limit=1`);
    const message = rows?.[0];
    if (!message?.media_id) {
      res.status(404).end('Media not found');
      return;
    }

    const client = await findClientById(message.client_id);
    if (!client) {
      res.status(404).end('Client not found');
      return;
    }

    const media = await fetchWhatsAppMedia(message.media_id, client);
    const mime = media.mimeType || message.media_mime_type || 'application/octet-stream';
    const filename = message.media_filename || 'whatsapp-media';
    const safeFilename = String(filename).replace(/[\r\n"\\]/g, '');
    const disposition = req.query?.download === '1' ? 'attachment' : 'inline';
    const total = media.buffer.length;
    const range = req.headers.range;

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeFilename}"`);

    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const [rawStart, rawEnd] = range.replace('bytes=', '').split('-');
      const start = rawStart === '' ? 0 : Number(rawStart);
      const end = rawEnd === '' ? total - 1 : Math.min(Number(rawEnd), total - 1);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= total) {
        res.status(416);
        res.setHeader('Content-Range', `bytes */${total}`);
        res.end();
        return;
      }
      const chunk = media.buffer.subarray(start, end + 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(chunk.length));
      res.end(chunk);
      return;
    }

    res.status(200);
    res.setHeader('Content-Length', String(total));
    res.end(media.buffer);
  } catch (error) {
    console.error('media proxy', error);
    res.status(502).end('No se pudo cargar el archivo');
  }
}
