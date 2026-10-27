// Background two-way sync: SQLite outbox -> Supabase (sync_push), Supabase -> SQLite by seq cursor (sync_pull).
// Billing never waits on this; if the network is down we just retry on the next tick.
import { createClient } from '@supabase/supabase-js';
import { toWire } from '@fitsecret/shared';
import { getMeta, setMeta, applyRemote } from './db.js';

const BATCH = 500;

// One table at a time: a table the cloud rejects (e.g. a migration not run yet) keeps its rows queued and is reported,
// but never holds back the others (one bad branch row once stopped every bill from syncing).
export async function pushOnce(db, rpc) {
  let sent = 0;
  const failed = new Map(); // table -> error
  for (;;) {
    const skip = [...failed.keys()];
    const box = db.prepare(`select id, tbl, row_id from outbox ${skip.length ? `where tbl not in (${skip.map(() => '?').join(',')})` : ''} order by id limit ?`).all(...skip, BATCH);
    if (!box.length) break;
    const payload = {}, seen = new Set();
    for (const { tbl, row_id } of box) {
      if (seen.has(tbl + row_id)) continue; // server can't upsert the same id twice in one statement
      seen.add(tbl + row_id);
      const row = db.prepare(`select * from ${tbl} where id = ?`).get(row_id);
      if (row) (payload[tbl] ??= []).push(toWire(tbl, row));
    }
    const last = box.at(-1).id;
    try { // normal case: the whole batch in one transaction (a bill and its lines land together)
      if (Object.keys(payload).length) await rpc('sync_push', { p: payload });
      db.prepare(`delete from outbox where id <= ? ${skip.length ? `and tbl not in (${skip.map(() => '?').join(',')})` : ''}`).run(last, ...skip);
      sent += seen.size;
      continue;
    } catch (e) { if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(e.message + (e.cause?.code || ''))) throw e; }
    for (const tbl of new Set(box.map((b) => b.tbl))) { // rejected: find which table, send the rest
      try {
        if (payload[tbl]) await rpc('sync_push', { p: { [tbl]: payload[tbl] } });
        db.prepare('delete from outbox where tbl = ? and id <= ?').run(tbl, last);
        sent += payload[tbl]?.length || 0;
      } catch (e) {
        if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(e.message + (e.cause?.code || ''))) throw e; // offline: try everything later
        failed.set(tbl, e.message);
      }
    }
  }
  if (failed.size) throw new Error([...failed].map(([t, m]) => `${t}: ${m}`).join('; '));
  return sent;
}

export async function pullOnce(db, rpc) {
  let got = 0;
  for (;;) {
    const since = Number(getMeta(db, 'sync_cursor') || 0);
    const res = await rpc('sync_pull', { p_since: since, p_limit: 1000 });
    if (res.rows.length) applyRemote(db, res.rows);
    setMeta(db, 'sync_cursor', res.cursor);
    got += res.rows.length;
    if (!res.more) return got;
  }
}

export function createSync(db, { interval = 10000, log = console, afterPull } = {}) {
  const status = { state: 'off', pending: 0, lastSync: null, error: null };
  let client = null, clientKey = '', running = false, timer = null, kickTimer = null;

  const config = () => JSON.parse(getMeta(db, 'sync_config') || '{}');
  // a password is never kept on disk: older setups that stored one have it moved to memory and used for one sign-in
  let password = null;
  { const { password: old, ...rest } = config(); if (old) { password = old; setMeta(db, 'sync_config', JSON.stringify(rest)); } }

  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }

  // The password is used once, to sign in; from then on only Supabase's refresh token is kept (it rotates on every refresh and
  // can be revoked by signing the user out in Supabase). Nothing on this PC opens the account if the password changes.
  const keepToken = (refresh) => { const c = config(); if (c.url) setMeta(db, 'sync_config', JSON.stringify({ url: c.url, anonKey: c.anonKey, email: c.email, refresh })); };
  async function connect(cfg) {
    const key = [cfg.url, cfg.anonKey, cfg.email].join('|');
    if (client && clientKey === key) return;
    client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: true } });
    client.auth.onAuthStateChange((_e, s) => { if (s?.refresh_token) keepToken(s.refresh_token); });
    const { data, error } = password ? await client.auth.signInWithPassword({ email: cfg.email, password })
      : cfg.refresh ? await client.auth.refreshSession({ refresh_token: cfg.refresh }) : { error: { message: 'no password' } };
    if (error) {
      client = null;
      throw new Error(password ? 'Login failed: ' + error.message : 'Cloud sign-in expired: enter the sync password again in Settings → Cloud sync');
    }
    password = null;
    if (data?.session?.refresh_token) keepToken(data.session.refresh_token);
    clientKey = key;
  }

  async function run() {
    if (running) return;
    running = true;
    try {
      const cfg = config();
      status.pending = db.prepare('select count(*) n from outbox').get().n;
      if (!cfg.url) { status.state = 'off'; return; }
      status.state = 'syncing';
      await connect(cfg);
      await pushOnce(db, rpc);
      if (await pullOnce(db, rpc)) afterPull?.(); // e.g. invoice newly arrived online orders
      Object.assign(status, { state: 'online', lastSync: new Date().toISOString(), error: null });
    } catch (e) {
      const offline = /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(e.message + (e.cause?.code || ''));
      Object.assign(status, { state: offline ? 'offline' : 'error', error: e.message });
      if (!offline) { client = null; log.warn?.('[sync]', e.message); }
    } finally {
      status.pending = db.prepare('select count(*) n from outbox').get().n;
      running = false;
    }
  }

  return {
    status: () => ({ ...status, configured: !!config().url, url: config().url || '', email: config().email || '' }),
    configure(cfg) {
      const { password: pw, ...rest } = cfg || {};
      setMeta(db, 'sync_config', cfg ? JSON.stringify(rest) : null); password = pw || null; client = null; return run();
    },
    run,
    // Debounced nudge after local writes so the cloud copy follows within ~1.5s when online.
    kick() { clearTimeout(kickTimer); kickTimer = setTimeout(run, 1500); },
    start() { run(); timer = setInterval(run, interval); },
    // Certificate PDFs / photos go to the public 'certificates' bucket so the website can link them. null when not connected.
    async upload(name, data, type) {
      const cfg = config();
      if (!cfg.url) return null;
      try {
        await connect(cfg);
        const { error } = await client.storage.from('certificates').upload(name, data, { contentType: type, upsert: false });
        if (error) throw error;
        return client.storage.from('certificates').getPublicUrl(name).data.publicUrl;
      } catch (e) { log.warn?.('[upload]', e.message); return null; }
    },
    stop() { clearInterval(timer); clearTimeout(kickTimer); },
  };
}
