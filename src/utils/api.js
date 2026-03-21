const BASE = '/api';

function arr(d) {
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.results)) return d.results;
  return [];
}

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);

  if (!res.ok) {
    let msg  = `HTTP ${res.status}`;
    let raw  = '';
    try {
      const j = await res.json();
      raw  = JSON.stringify(j);
      msg  = j.error || j.detail || msg;
    } catch {}
    const err    = new Error(msg);
    err.status   = res.status;
    err.raw      = raw;
    throw err;
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res;
}

export const api = {
  health:        ()         => req('/health/'),
  analytics:     ()         => req('/analytics/'),

  users:         ()         => req('/users/').then(arr),
  logs:          (p = {})   => req('/logs/?' + new URLSearchParams(p).toString()).then(arr),
  sessions:      (p = {})   => req('/sessions/?' + new URLSearchParams(p).toString()).then(arr),

  deleteUser:    (id)       => req(`/users/${id}/delete/`, { method: 'DELETE' }),
  addPhotos:     (id, form) => req(`/users/${id}/photos/`, { method: 'POST', body: form }),

  register:      (form)     => req('/register/',  { method: 'POST', body: form }),
  scan:          (form)     => req('/scan/',       { method: 'POST', body: form }),

  exportCSV:     (date)     => req(`/export/?date=${date}`),
  resetPresence: ()         => req('/reset-presence/', { method: 'POST' }),

  extractMulti: (form) => req('/extract-multi/', { method: 'POST', body: form }),

  aiInsight: (mode, prompt = '') =>
    req('/ai-insight/', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mode, prompt }),
    }),

  semanticQuery: (query, mode = 'groq') =>
    req('/semantic-query/', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query, mode }),
    }),
};
