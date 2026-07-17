const API_BASE = '/api';

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfToken() {
  if (!getCookie('csrf_token')) {
    await fetch(`${API_BASE}/csrf-token`, { credentials: 'same-origin' });
  }
  return getCookie('csrf_token');
}

async function handleResponse(res) {
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    // no JSON body
  }
  if (!res.ok) {
    const message = (data && (data.error || (Array.isArray(data.message) ? data.message[0] : data.message))) || 'Une erreur est survenue.';
    throw new Error(message);
  }
  return data;
}

export async function apiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = Object.assign({}, options.headers);
  let body = options.body;

  if (method !== 'GET') {
    const token = await ensureCsrfToken();
    headers['x-csrf-token'] = token;
    if (body && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, method, headers, body, credentials: 'same-origin' });
  return handleResponse(res);
}

// Same CSRF-aware fetch, but for multipart/form-data uploads (no JSON body/Content-Type override).
export async function apiUpload(path, formData) {
  const token = await ensureCsrfToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'x-csrf-token': token },
    body: formData,
  });
  return handleResponse(res);
}
