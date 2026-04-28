const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ─── Core fetch wrapper with auto-refresh ───────────────────────
async function request(path, options = {}) {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });

  if (res.status === 401) {
    const refreshed = await _refreshToken();
    if (refreshed) return request(path, options);
    window.dispatchEvent(new Event('auth:logout'));
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

async function _refreshToken() {
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    return true;
  } catch {
    return false;
  }
}

// ─── SSE stream reader for POST endpoints (chat) ────────────────
// Backend streams: data: {"type":"delta","content":"..."} 
//                  data: {"type":"sources","sources":[...]}
//                  data: {"type":"done"}
export async function readSSEStream(response, { onDelta, onSources, onDone, onError }) {
  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = 'message';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) {
          currentEvent = 'message';
          continue;
        }
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim() || 'message';
          continue;
        }
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        try {
          const data = JSON.parse(raw);
          const type = String(data.type || currentEvent || '').toLowerCase();
          if (type === 'delta') onDelta?.(data.content ?? data.text ?? data.delta ?? '');
          else if (type === 'sources') onSources?.(data.sources ?? []);
          else if (type === 'done') { onDone?.(data); return; }
          // operation logs format
          else if (data.message || data.level) onDelta?.(data.message ?? '');
          else if (data.text || data.delta) onDelta?.(data.text ?? data.delta ?? '');
        } catch {
          // plain text delta fallback
          onDelta?.(raw);
        }
      }
    }
    onDone?.();
  } catch (e) {
    onError?.(e);
  }
}

// ─── SSE via EventSource (GET endpoints) ───────────────────────
export function openEventSource(path, { onMessage, onDone, onError } = {}) {
  const token = localStorage.getItem('access_token');
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${path}${sep}token=${token}`;
  const es = new EventSource(url);

  const handleEvent = (eventName, e) => {
    try {
      const data = JSON.parse(e.data);
      if (eventName === 'done' || data.done) { onDone?.(data); es.close(); }
      else onMessage?.(data, eventName);
    } catch {
      if (eventName === 'done') { onDone?.({ raw: e.data }); es.close(); }
      else onMessage?.(e.data, eventName);
    }
  };

  es.onmessage = (e) => handleEvent('message', e);
  ['operation', 'status', 'state', 'log', 'sources', 'delta', 'done', 'error'].forEach((eventName) => {
    es.addEventListener(eventName, (e) => handleEvent(eventName, e));
  });
  es.onerror = (e) => { onError?.(e); es.close(); };
  return es; // caller must call .close() if needed
}

// ─── AUTH (/auth) ───────────────────────────────────────────────
// POST /auth/google  — login with Google id_token
// POST /auth/refresh — refresh access token (reads cookie)
// POST /auth/logout  — revoke refresh token + clear cookie
export const auth = {
  google:  (id_token) => request('/auth/google',  { method: 'POST', body: JSON.stringify({ id_token }) }),
  refresh: _refreshToken,
  logout:  ()         => request('/auth/logout',   { method: 'POST' }),
  calendarAuthorizationUrl: (redirectUri) => {
    const qs = redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : '';
    return request(`/auth/google/calendar/authorization-url${qs}`);
  },
  calendarConnect: (authorizationCode, redirectUri) =>
    request('/auth/google/calendar/connect', {
      method: 'POST',
      body: JSON.stringify({
        authorization_code: authorizationCode,
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      }),
    }),
  calendarStatus: () => request('/auth/google/calendar/status'),
  calendarDisconnect: () => request('/auth/google/calendar/disconnect', { method: 'DELETE' }),
};

// ─── SCHEDULES (/schedules) ─────────────────────────────────────
// POST   /schedules        — { name, description }
// GET    /schedules        — list all
// GET    /schedules/{id}   — detail + document summary + latest plan
// PATCH  /schedules/{id}   — { name?, description? }
// DELETE /schedules/{id}   — soft delete (status = archived)
export const schedules = {
  list:   ()           => request('/schedules'),
  get:    (id)         => request(`/schedules/${id}`),
  create: (body)       => request('/schedules',     { method: 'POST',  body: JSON.stringify(body) }),
  update: (id, body)   => request(`/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id)         => request(`/schedules/${id}`, { method: 'DELETE' }),
};

// ─── DOCUMENTS (/schedules/{id}/documents) ──────────────────────
// POST   /schedules/{id}/documents               — multipart upload
// GET    /schedules/{id}/documents               — list
// GET    /schedules/{id}/documents/{doc_id}      — single doc
// GET    /schedules/{id}/documents/{doc_id}/ingest-status
// DELETE /schedules/{id}/documents/{doc_id}
export const documents = {
  list:   (scheduleId)          => request(`/schedules/${scheduleId}/documents`),
  get:    (scheduleId, docId)   => request(`/schedules/${scheduleId}/documents/${docId}`),
  getChunk: (scheduleId, chunkId) => request(`/schedules/${scheduleId}/documents/chunks/${chunkId}`),
  delete: (scheduleId, docId)   => request(`/schedules/${scheduleId}/documents/${docId}`, { method: 'DELETE' }),

  ingestStatus: (scheduleId, docId) =>
    request(`/schedules/${scheduleId}/documents/${docId}/ingest-status`),

  upload: async (scheduleId, files) => {
    const token = localStorage.getItem('access_token');
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    const res = await fetch(`${BASE_URL}/schedules/${scheduleId}/documents`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` }, // no Content-Type — browser sets boundary
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Upload failed: HTTP ${res.status}`);
    }
    return res.json(); // { documents: [...], operation_ids: [...] }
  },
};

// ─── PLAN (/schedules/{id}/plan) ────────────────────────────────
// POST   /schedules/{id}/plan/generate        — synchronous
// POST   /schedules/{id}/plan/generate-async  — returns { operation_id }
// GET    /schedules/{id}/plan/logs            — planner logs
// PATCH  /schedules/{id}/plan                 — revise with feedback
// POST   /schedules/{id}/plan/confirm         — plan → sessions
// POST   /schedules/{id}/plan/sync-calendar   — sync to Google Calendar
// GET    /schedules/{id}/plan/sessions        — list sessions under plan
// GET    /schedules/{id}/plan/sessions/{sid}  — session detail
// DELETE /schedules/{id}/plan/{plan_id}       — delete one plan
// DELETE /schedules/{id}/plan                 — delete all plans
export const plan = {
  get:           (scheduleId)               => request(`/schedules/${scheduleId}/plan`),
  listAll:       (scheduleId)               => request(`/schedules/${scheduleId}/plan/all`),
  generate:      (scheduleId, body)         => request(`/schedules/${scheduleId}/plan/generate`,       { method: 'POST',  body: JSON.stringify(body) }),
  generateAsync: (scheduleId, body)         => request(`/schedules/${scheduleId}/plan/generate-async`, { method: 'POST',  body: JSON.stringify(body) }),
  reviseAsync:   (scheduleId, body)         => request(`/schedules/${scheduleId}/plan/patch-async`,    { method: 'PATCH', body: JSON.stringify(body) }),
  logs:          (scheduleId)               => request(`/schedules/${scheduleId}/plan/logs`),
  revise:        (scheduleId, body)         => request(`/schedules/${scheduleId}/plan`,                { method: 'PATCH', body: JSON.stringify(body) }),
  confirm:       (scheduleId, body = {})    => request(`/schedules/${scheduleId}/plan/confirm`,        { method: 'POST',  body: JSON.stringify(body) }),
  syncCalendar:  (scheduleId, body = {})    => request(`/schedules/${scheduleId}/plan/sync-calendar`,  { method: 'POST',  body: JSON.stringify(body) }),
  unsyncCalendar:(scheduleId, body = {})    => request(`/schedules/${scheduleId}/plan/unsync-calendar`,{ method: 'POST',  body: JSON.stringify(body) }),
  sessions:      (scheduleId)               => request(`/schedules/${scheduleId}/plan/sessions`),
  session:       (scheduleId, sessionId)    => request(`/schedules/${scheduleId}/plan/sessions/${sessionId}`),
  deletePlan:    (scheduleId, planId)       => request(`/schedules/${scheduleId}/plan/${planId}`,      { method: 'DELETE' }),
  deleteAll:     (scheduleId)               => request(`/schedules/${scheduleId}/plan`,                { method: 'DELETE' }),
};

// ─── SCHEDULE CHAT (/schedules/{id}/chat) ───────────────────────
// POST   /schedules/{id}/chat          — SSE stream
// GET    /schedules/{id}/chat/history  — paginated
// DELETE /schedules/{id}/chat/history  — clear
export const scheduleChat = {
  history:      (scheduleId, { limit = 30, offset = 0 } = {}) =>
    request(`/schedules/${scheduleId}/chat/history?limit=${limit}&offset=${offset}`),
  clearHistory: (scheduleId)           => request(`/schedules/${scheduleId}/chat/history`, { method: 'DELETE' }),

  // Returns a Promise; streams deltas via callbacks
  send: async (scheduleId, message, { onDelta, onSources, onDone, onError } = {}) => {
    const token = localStorage.getItem('access_token');
    const res = await fetch(`${BASE_URL}/schedules/${scheduleId}/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) { onError?.(new Error(`HTTP ${res.status}`)); return; }
    return readSSEStream(res, { onDelta, onSources, onDone, onError });
  },
};

// ─── SESSIONS (/sessions) ───────────────────────────────────────
// POST   /sessions/{id}/start              — mark active, begin briefing
// GET    /sessions/{id}/briefing/stream    — SSE briefing text
// POST   /sessions/{id}/chat              — SSE chat
// GET    /sessions/{id}/chat/history
// POST   /sessions/{id}/complete
// GET    /sessions/{id}/sidebar            — prerequisites + upcoming
export const sessions = {
  start:       (sessionId) => request(`/sessions/${sessionId}/start`,   { method: 'POST' }),
  sidebar:     (sessionId) => request(`/sessions/${sessionId}/sidebar`),
  chatHistory: (sessionId) => request(`/sessions/${sessionId}/chat/history`),
  complete:    (sessionId) => request(`/sessions/${sessionId}/complete`, { method: 'POST' }),

  // GET SSE briefing stream via EventSource
  briefingStream: (sessionId, { onDelta, onDone, onError } = {}) =>
    openEventSource(`/sessions/${sessionId}/briefing/stream`, {
      onMessage: (data) => {
        if (data.delta || data.text) onDelta?.(data.delta ?? data.text ?? '');
        else if (typeof data === 'string') onDelta?.(data);
      },
      onDone,
      onError,
    }),

  // POST SSE chat stream via fetch
  chat: async (sessionId, message, { onDelta, onSources, onDone, onError } = {}) => {
    const token = localStorage.getItem('access_token');
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) { onError?.(new Error(`HTTP ${res.status}`)); return; }
    return readSSEStream(res, { onDelta, onSources, onDone, onError });
  },
};

// ─── OPERATIONS (/operations) ───────────────────────────────────
// GET /operations/{id}/logs    — polling
// GET /operations/{id}/stream  — SSE
export const operations = {
  logs: (opId) => request(`/operations/${opId}/logs`),

  stream: (opId, { onMessage, onDone, onError } = {}) =>
    openEventSource(`/operations/${opId}/stream`, { onMessage, onDone, onError }),
};
