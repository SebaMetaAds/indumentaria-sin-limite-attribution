const base = () => {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL no configurada');
  return `${url.replace(/\/$/, '')}/rest/v1`;
};

const key = () => {
  const k = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!k) throw new Error('SUPABASE_PUBLISHABLE_KEY no configurada');
  return k;
};

const backendSecret = () => {
  const s = process.env.SUPABASE_BACKEND_SECRET;
  if (!s) throw new Error('SUPABASE_BACKEND_SECRET no configurado');
  return s;
};

export async function db(path, options = {}) {
  const k = key();
  const headers = {
    apikey: k,
    'x-backend-secret': backendSecret(),
    'Content-Type': 'application/json',
    Prefer: options.prefer || 'return=representation',
    ...(options.headers || {})
  };
  if (k.startsWith('eyJ')) headers.Authorization = `Bearer ${k}`;
  const res = await fetch(`${base()}${path}`, {
    ...options,
    headers
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

export async function insert(table, payload, { onConflict, resolution } = {}) {
  let path = `/${table}`;
  if (onConflict) path += `?on_conflict=${encodeURIComponent(onConflict)}`;
  return db(path, {
    method: 'POST',
    body: JSON.stringify(payload),
    prefer: resolution ? `resolution=${resolution},return=representation` : 'return=representation'
  });
}

export async function patch(table, filters, payload) {
  const qs = new URLSearchParams(filters).toString();
  return db(`/${table}?${qs}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function select(table, query = '') {
  return db(`/${table}?${query}`, { method: 'GET' });
}
