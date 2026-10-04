export function sendJson(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export function requireAdmin(req, res) {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    sendJson(res, 500, { error: 'DASHBOARD_PASSWORD no configurada' });
    return false;
  }
  const provided = req.headers['x-admin-password'];
  if (provided !== expected) {
    sendJson(res, 401, { error: 'No autorizado' });
    return false;
  }
  return true;
}

export function isoRange(query = {}) {
  const days = Math.max(1, Math.min(90, Number(query.days || 7)));
  const until = query.until ? new Date(`${query.until}T23:59:59.999Z`) : new Date();
  const since = query.since ? new Date(`${query.since}T00:00:00.000Z`) : new Date(until.getTime() - (days - 1) * 86400000);
  return { since: since.toISOString(), until: until.toISOString(), days };
}
