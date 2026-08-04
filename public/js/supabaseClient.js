// Loaded after /config.js (sets window.ENV) and the Supabase CDN script on every page.
window.supabaseClient = window.supabase.createClient(window.ENV.SUPABASE_URL, window.ENV.SUPABASE_ANON_KEY);

// Small fetch wrapper used by every page: automatically attaches the signed-in coach's
// access token so the backend's requireAuth middleware can verify who's calling.
async function apiFetch(path, options) {
  options = options || {};
  const { data } = await window.supabaseClient.auth.getSession();
  const token = data && data.session ? data.session.access_token : null;
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(path, Object.assign({}, options, { headers }));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || ('Request failed (' + res.status + ')'));
  return body;
}

// Redirects to the login page if nobody's signed in. Call this at the top of any
// protected page (dashboard, designer, team, billing, settings).
async function requireSession() {
  const { data } = await window.supabaseClient.auth.getSession();
  if (!data.session) {
    window.location.href = '/login.html';
    return null;
  }
  return data.session;
}

async function signOut() {
  await window.supabaseClient.auth.signOut();
  window.location.href = '/login.html';
}
