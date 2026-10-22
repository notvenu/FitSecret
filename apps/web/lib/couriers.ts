import 'server-only';
import { parseShiprocket, parseDelhivery, type Tracking } from '@fitsecret/shared/couriers';

// Live courier tracking for the Track page. Keys are server env only:
//   SHIPROCKET_EMAIL + SHIPROCKET_PASSWORD (an API user: Shiprocket → Settings → API → Configure)
//   DELHIVERY_API_TOKEN (+ DELHIVERY_STAGING=1 to use the staging host)
// ponytail: per-instance memory cache (10 min per AWB, token until expiry); move to a shared cache if the site runs many instances.

const SR = 'https://apiv2.shiprocket.in/v1/external';
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; t: Tracking | null }>();
let srToken: { token: string; exp: number } | null = null;

export const courierConfigured = {
  shiprocket: () => !!(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD),
  delhivery: () => !!process.env.DELHIVERY_API_TOKEN,
};

async function shiprocketToken(fresh = false) {
  if (!fresh && srToken && srToken.exp > Date.now()) return srToken.token;
  const r = await fetch(`${SR}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw new Error('Shiprocket login failed');
  srToken = { token: j.token, exp: Date.now() + 9 * 864e5 }; // tokens last 10 days; renew a day early
  return srToken.token;
}

async function shiprocket(awb: string) {
  const get = async (token: string) => fetch(`${SR}/courier/track/awb/${encodeURIComponent(awb)}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
  let r = await get(await shiprocketToken());
  if (r.status === 401) r = await get(await shiprocketToken(true));
  return parseShiprocket(await r.json().catch(() => null), awb);
}

async function delhivery(awb: string) {
  const host = process.env.DELHIVERY_STAGING ? 'https://staging-express.delhivery.com' : 'https://track.delhivery.com';
  const r = await fetch(`${host}/api/v1/packages/json/?waybill=${encodeURIComponent(awb)}`, {
    headers: { authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000),
  });
  return parseDelhivery(await r.json().catch(() => null), awb);
}

export async function liveTracking(provider: 'shiprocket' | 'delhivery', awb: string): Promise<Tracking | null> {
  if (!courierConfigured[provider]()) return null;
  const key = `${provider}:${awb}`, hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.t;
  const t = await (provider === 'shiprocket' ? shiprocket(awb) : delhivery(awb)).catch(() => hit?.t ?? null); // courier down: keep last known
  cache.set(key, { at: Date.now(), t });
  return t;
}
