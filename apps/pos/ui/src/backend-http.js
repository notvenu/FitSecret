// Default back end: the POS server on the shop PC (Express + SQLite). /admin on the website swaps this for a Supabase one via the @backend alias.
export const CLOUD = false;
export const CloudLogin = null;

export async function call(path, body, method, token) {
  const r = await fetch(import.meta.env.BASE_URL + 'api' + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', 'x-token': token || '' },
    body: body && JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Request failed (${r.status})`), { status: r.status });
  return j;
}
