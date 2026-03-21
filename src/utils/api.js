const BASE = '/api';

function arr(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error || j.detail || msg; } catch {}
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res;
}

export const api = {
  // Core
  health:        ()          => req('/health/'),
  analytics:     ()          => req('/analytics/'),

  // Users
  users:         ()          => req('/users/').then(arr),
  deleteUser:    (id)        => req(`/users/${id}/delete/`, { method: 'DELETE' }),
  addPhotos:     (id, form)  => req(`/users/${id}/photos/`, { method: 'POST', body: form }),

  // Registration + Scan
  register:      (form)      => req('/register/',  { method: 'POST', body: form }),
  scan:          (form)      => req('/scan/',       { method: 'POST', body: form }),

  // Logs
  logs:          (p = {})    => req('/logs/?' + new URLSearchParams(p).toString()).then(arr),
  sessions:      (p = {})    => req('/sessions/?' + new URLSearchParams(p).toString()).then(arr),

  // Export
  exportCSV:     (date)      => req(`/export/?date=${date}`),

  // Analytics AI
  aiInsight: (mode, prompt = '') =>
    req('/ai-insight/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, prompt }),
    }),

  // Semantic / RAG query  ← NEW
  semanticQuery: (query, mode = 'groq') =>
    req('/semantic-query/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, mode }),
    }),

  // Snapshots ← NEW
  snapshots:     (p = {})    => req('/snapshots/?' + new URLSearchParams(p).toString()).then(arr),

  // Model selection ← NEW
  getModels:     ()          => req('/models/'),
  setModel:      (model)     => req('/models/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  }),

  // Utility
  resetPresence: ()          => req('/reset-presence/', { method: 'POST' }),
};
