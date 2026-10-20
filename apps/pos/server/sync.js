// Background two-way sync: SQLite outbox -> Supabase (sync_push), Supabase -> SQLite by seq cursor (sync_pull).
// Billing never waits on this; if the network is down we just retry on the next tick.
import { createClient } from '@supabase/supabase-js';
import { toWire } from '@fitsecret/shared';
import { getMeta, setMeta, applyRemote } from './db.js';

const BATCH = 500;

export async function pushOnce(db, rpc) {
  let sent = 0;
  for (;;) {
    const box = db.prepare('select id, tbl, row_id from outbox order by id limit ?').all(BATCH);
    if (!box.length) return sent;
    const payload = {}, seen = new Set();
    for (const { tbl, row_id } of box) {
      if (seen.has(tbl + row_id)) continue; // server can't upsert the same id twice in one statement
      seen.add(tbl + row_id);
      const row = db.prepare(`select * from ${tbl} where id = ?`).get(row_id);
      if (row) (payload[tbl] ??= []).push(toWire(tbl, row));
    }
    if (Object.keys(payload).length) await rpc('sync_push', { p: payload });
    db.prepare('delete from outbox where id <= ?').run(box.at(-1).id);
    sent += seen.size;
  }
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

  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }

  async function connect(cfg) {
    const key = [cfg.url, cfg.anonKey, cfg.email].join('|');
    if (client && clientKey === key) return;
    client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: true } });
    const { error } = await client.auth.signInWithPassword({ email: cfg.email, password: cfg.password });
    if (error) { client = null; throw new Error('Login failed: ' + error.message); }
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
    configure(cfg) { setMeta(db, 'sync_config', cfg ? JSON.stringify(cfg) : null); client = null; return run(); },
    run,
    // Debounced nudge after local writes so the cloud copy follows within ~1.5s when online.
    kick() { clearTimeout(kickTimer); kickTimer = setTimeout(run, 1500); },
    start() { run(); timer = setInterval(run, interval); },
    stop() { clearInterval(timer); clearTimeout(kickTimer); },
  };
}
