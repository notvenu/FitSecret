// FitSecret POS local server. Runs on the shop PC; billing counters on the LAN open http://<pc-ip>:4321
import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLES, toWire, today, ORDER_LABEL } from '@fitsecret/shared';
import { SEED_CATEGORIES, SEED_ITEMS } from '@fitsecret/shared/seed';
import { runReport, balanceSheet, checkJournal, pointsValue } from '@fitsecret/shared/reports';
import { checkCoupon } from '@fitsecret/shared/store';
import * as D from './db.js';
import * as R from './reports.js';
import { createSync } from './sync.js';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = process.env.FITSECRET_DATA || join(here, '..', 'data');
mkdirSync(join(DATA, 'backups'), { recursive: true });

export function createApp(db, sync) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  const sessions = new Map(); // token -> user  (ponytail: in-memory; restart = re-login)
  const branch = () => D.getMeta(db, 'branch_id');

  // ---------- auth ----------
  const auth = (role) => (req, res, next) => {
    const u = sessions.get(req.get('x-token'));
    if (!u) return res.status(401).json({ error: 'Login required' });
    if (role === 'admin' && u.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    req.user = u; next();
  };
  const wrap = (fn) => async (req, res) => {
    try {
      const out = await fn(req, res);
      if (req.method !== 'GET') sync.kick();
      if (out !== undefined) res.json(out);
    } catch (e) {
      if (!(e instanceof D.UserError)) console.error(e);
      res.status(e instanceof D.UserError ? 400 : 500).json({ error: e.message });
    }
  };

  app.get('/api/bootstrap', wrap((req) => ({
    setup: !branch(),
    branch: branch() && D.getWire(db, 'branches', branch()),
    user: sessions.get(req.get('x-token')) || null,
    users: db.prepare('select id, name, role from users where active = 1 order by name').all(),
    branches: db.prepare('select * from branches where deleted = 0').all().map((b) => toWire('branches', b)),
    sync: sync.status(),
  })));

  app.post('/api/setup', wrap(({ body }) => {
    if (branch()) throw new D.UserError('Already set up');
    const { branch: b = {}, admin = {}, demo } = body;
    const catalog = body.catalog ?? demo, demoStock = body.demoStock ?? demo; // real catalogue vs. fake opening stock for testing
    if (!b.id && (!b.name || !/^[A-Z0-9]{2,5}$/.test(b.code || ''))) throw new D.UserError('Branch name and 2-5 letter code required');
    D.tx(db, () => {
      const saved = b.id && D.get(db, 'branches', b.id) ? D.getWire(db, 'branches', b.id) : D.save(db, 'branches', { state_code: '37', ...b });
      D.setMeta(db, 'branch_id', saved.id);
      D.saveUser(db, { name: admin.name, pin: admin.pin, role: 'admin' });
      if (catalog) {
        for (const c of SEED_CATEGORIES) D.save(db, 'categories', c);
        const exp = new Date(Date.now() + 400 * 864e5).toLocaleDateString('en-CA');
        SEED_ITEMS.forEach((it, i) => {
          D.save(db, 'items', it);
          if (demoStock) D.save(db, 'stock_movements', { branch_id: saved.id, item_id: it.id, qty: 6 + ((i * 7) % 20), batch_no: 'B' + (100 + i), expiry: exp, ref_type: 'opening' });
        });
      }
    });
    return { ok: true };
  }));

  app.post('/api/login', wrap(({ body }) => {
    const u = db.prepare('select * from users where id = ? and active = 1').get(body.user_id);
    if (!u || !D.checkPin(u.pin, body.pin)) throw new D.UserError('Wrong PIN');
    const token = randomUUID(), user = { id: u.id, name: u.name, role: u.role };
    sessions.set(token, user);
    return { token, user };
  }));
  app.post('/api/logout', (req, res) => { sessions.delete(req.get('x-token')); res.json({ ok: true }); });

  // ---------- catalogue & masters ----------
  app.get('/api/items', auth(), wrap(() => {
    const stock = D.stockMap(db, branch());
    return db.prepare(`select i.*, c.name category from items i left join categories c on c.id = i.category_id where i.deleted = 0 order by i.name`)
      .all().map((i) => ({ ...toWire('items', i), category: i.category, stock: stock[i.id] || 0 }));
  }));
  app.get('/api/items/:id/batches', auth(), wrap((req) => D.batches(db, branch(), req.params.id)));
  app.get('/api/items/:id/movements', auth(), wrap((req) => db.prepare(
    `select m.*, i.no invoice_no from stock_movements m left join invoices i on i.id = m.ref_id
     where m.item_id = ? and m.branch_id = ? and m.deleted = 0 order by m.created_at desc limit 200`).all(req.params.id, branch())));
  app.post('/api/stock/adjust', auth('admin'), wrap(({ body }) => { D.adjustStock(db, branch(), body); return { ok: true }; }));

  app.get('/api/parties', auth(), wrap(() => {
    const bal = Object.fromEntries(R.partyBalances(db).map((b) => [b.id, b.balance]));
    return db.prepare('select * from parties where deleted = 0 order by name').all().map((p) => ({ ...toWire('parties', p), balance: bal[p.id] || 0 }));
  }));
  app.get('/api/parties/:id/ledger', auth(), wrap((req) => R.ledger(db, req.params.id)));

  const WRITABLE = { categories: 'admin', items: 'admin', parties: null, expenses: null, branches: 'admin', accounts: 'admin', journals: 'admin', coupons: 'admin', feedback: null };
  const liveRows = (t) => db.prepare(`select * from ${t} where deleted = 0`).all().map((r) => toWire(t, r));
  const userErr = (fn) => { try { return fn(); } catch (e) { throw new D.UserError(e.message); } };
  // Loyalty points can only pay up to what the customer has earned.
  const checkPoints = (party_id, amount) => {
    if (!(amount > 0)) return;
    if (!party_id) throw new D.UserError('Select the customer to redeem points');
    const max = pointsValue(liveRows, branch(), party_id);
    if (amount > max + 0.001) throw new D.UserError(`Only ₹${max} of points available`);
  };
  app.get('/api/t/:table', auth(), wrap((req) => {
    const t = req.params.table;
    if (!TABLES[t]) throw new D.UserError('Unknown table');
    const branchScoped = 'branch_id' in TABLES[t] && t !== 'orders';
    return db.prepare(`select * from ${t} where deleted = 0 ${branchScoped ? 'and branch_id = ?' : ''} order by created_at desc limit 1000`)
      .all(...(branchScoped ? [branch()] : [])).map((r) => toWire(t, r));
  }));
  // One row of a master table, validated the same way for the form and for bulk import / bulk edit.
  const writeRow = (t, body) => {
    if (t === 'items' && body.barcode) {
      const dup = db.prepare('select name from items where barcode = ? and id <> ? and deleted = 0').get(body.barcode, body.id || '');
      if (dup) throw new D.UserError(`Barcode already used by ${dup.name}`);
    }
    if ('branch_id' in TABLES[t] && !body.branch_id && (!body.id || !D.get(db, t, body.id))) body.branch_id = branch();
    if (t === 'expenses' && !(Number(body.amount) > 0)) throw new D.UserError('Enter an amount');
    if (t === 'expenses') body.date ||= today();
    if (t === 'coupons' && !body.deleted) body = userErr(() => checkCoupon({ active: true, ...(body.id && D.getWire(db, 'coupons', body.id)), ...body }, liveRows('coupons')));
    const isNew = !body.id || !D.get(db, t, body.id);
    if (isNew && !body.name && ['categories', 'items', 'parties', 'branches', 'accounts'].includes(t)) throw new D.UserError('Name required');
    if (body.name !== undefined && !String(body.name).trim() && ['categories', 'items', 'parties', 'branches', 'accounts'].includes(t)) throw new D.UserError('Name required');
    if (t === 'journals' && !body.deleted) {
      body.lines = userErr(() => checkJournal(body, liveRows('accounts').filter((a) => a.branch_id === branch())));
      body.date ||= today();
      if (isNew && !body.no) body.no = 'JE-' + (db.prepare("select count(*) n from journals where branch_id = ?").get(branch()).n + 1);
    }
    const { opening_stock, add_stock, ...row } = body;
    const saved = D.save(db, t, row);
    if (t === 'items' && isNew && Number(opening_stock) > 0) D.adjustStock(db, branch(), { item_id: saved.id, qty: Number(opening_stock), note: 'Opening stock' });
    // Barcode import: units counted onto an item that already exists
    if (t === 'items' && !isNew && Number(add_stock) > 0) D.adjustStock(db, branch(), { item_id: saved.id, qty: Number(add_stock), note: 'Stock import' });
    return saved;
  };
  for (const [t, role] of Object.entries(WRITABLE)) {
    app.post(`/api/t/${t}`, auth(role), wrap(({ body }) => writeRow(t, body)));
    // Import / bulk edit: all rows or none. Errors name the row so the sheet can be fixed.
    app.post(`/api/t/${t}/bulk`, auth(t === 'parties' ? 'admin' : role), wrap(({ body }) => D.tx(db, () => (body.rows || []).map((r, i) => {
      try { return writeRow(t, r); } catch (e) { throw new D.UserError(`Row ${i + 1}${r.name ? ` (${r.name})` : ''}: ${e.message}`); }
    }))));
    app.delete(`/api/t/${t}/:id`, auth('admin'), wrap((req) => D.save(db, t, { id: req.params.id, deleted: true })));
  }

  // ---------- recycle bin ----------
  const TRASH = ['items', 'parties', 'categories', 'expenses'];
  app.get('/api/trash', auth('admin'), wrap(() => TRASH.flatMap((t) => db.prepare(`select * from ${t} where deleted = 1 order by updated_at desc limit 300`).all()
    .map((r) => ({ table: t, id: r.id, name: r.name || `${r.category} ${r.amount}`, deleted_at: r.updated_at })))));
  app.post('/api/trash/restore', auth('admin'), wrap(({ body }) => {
    if (!TRASH.includes(body.table)) throw new D.UserError('Cannot restore that');
    return D.save(db, body.table, { id: body.id, deleted: false });
  }));

  // ---------- invoices & payments ----------
  app.post('/api/invoices', auth(), wrap(({ body, user }) => {
    checkPoints(body.party_id, (body.payments || []).filter((p) => p.mode === 'points').reduce((s, p) => s + Number(p.amount), 0));
    return D.createInvoice(db, branch(), user, body);
  }));
  app.get('/api/invoices', auth(), wrap(({ query }) => R.register(db, branch(), query)));
  app.get('/api/invoices/:id', auth(), wrap((req) => D.invoiceWithLines(db, req.params.id) || Promise.reject(new D.UserError('Not found'))));
  app.post('/api/invoices/:id/cancel', auth('admin'), wrap((req) => D.cancelInvoice(db, req.params.id)));
  app.post('/api/payments', auth(), wrap(({ body }) => { if (body.mode === 'points') checkPoints(body.party_id, Number(body.amount)); return D.recordPayment(db, branch(), body); }));
  app.post('/api/cash', auth('admin'), wrap(({ body }) => D.cashAdjust(db, branch(), body)));

  // ---------- online orders ----------
  app.get('/api/orders', auth(), wrap(({ query }) => {
    const rows = db.prepare(`select * from orders where deleted = 0 ${query.status ? 'and status = ?' : ''} order by created_at desc limit 300`)
      .all(...(query.status ? [query.status] : []));
    const lines = db.prepare('select * from order_lines where order_id = ? and deleted = 0');
    const events = db.prepare('select status, note, created_at from order_events where order_id = ? and deleted = 0 order by created_at');
    return rows.map((o) => ({ ...toWire('orders', o), lines: lines.all(o.id), events: events.all(o.id) }));
  }));
  app.post('/api/orders/:id', auth(), wrap((req) => {
    if (req.body.status && !ORDER_LABEL[req.body.status]) throw new D.UserError('Bad status');
    D.updateOrder(db, req.params.id, req.body, req.user);
    D.syncOrderInvoice(db, branch(), req.params.id); // invoice / COD payment / cancellation follow the order
    return D.getWire(db, 'orders', req.params.id);
  }));
  app.post('/api/orders/:id/invoice', auth(), wrap((req) => D.invoiceFromOrder(db, branch(), req.user, req.params.id)));

  // ---------- reports ----------
  app.get('/api/reports/dashboard', auth(), wrap(() => R.dashboard(db, branch())));
  app.get('/api/reports/daybook', auth(), wrap(({ query }) => R.daybook(db, branch(), query.date || today())));
  app.get('/api/reports/gst', auth('admin'), wrap(({ query }) => R.gst(db, branch(), query)));
  app.get('/api/reports/stock', auth(), wrap(() => R.stockSummary(db, branch())));
  app.get('/api/reports/expiry', auth(), wrap(({ query }) => R.expiry(db, branch(), Number(query.days) || 60)));
  app.get('/api/reports/pnl', auth('admin'), wrap(({ query }) => R.pnl(db, branch(), query)));
  app.get('/api/reports/balance-sheet', auth('admin'), wrap(({ query }) => balanceSheet(liveRows, branch(), query.to || undefined)));
  app.get('/api/reports/x/:name', auth(), wrap((req) => {
    try { return runReport(req.params.name, liveRows, branch(), req.query, req.user.role); } catch (e) { throw e.user ? new D.UserError(e.message) : e; }
  }));

  // ---------- settings ----------
  app.get('/api/users', auth('admin'), wrap(() => db.prepare('select id, name, role, active from users order by name').all()));
  app.post('/api/users', auth('admin'), wrap(({ body }) => ({ id: D.saveUser(db, body) })));
  app.get('/api/sync', auth(), wrap(() => sync.status()));
  app.post('/api/sync/now', auth(), wrap(async () => { await sync.run(); return sync.status(); }));
  app.post('/api/sync/config', auth('admin'), wrap(async ({ body }) => {
    if (!body.url) { await sync.configure(null); return sync.status(); }
    const prev = JSON.parse(D.getMeta(db, 'sync_config') || '{}');
    await sync.configure({ url: body.url.trim(), anonKey: body.anonKey?.trim() || prev.anonKey, email: body.email?.trim(), password: body.password || prev.password });
    return sync.status();
  }));
  app.get('/api/backup', auth('admin'), (req, res) => {
    const file = backup(db);
    res.download(file);
  });

  // ---------- UI ----------
  const dist = join(here, '..', 'ui', 'dist');
  // index.html is never cached so counters pick up a new build on reload; hashed assets can be cached forever.
  app.use(express.static(dist, { index: false, setHeaders: (res, path) => res.setHeader('Cache-Control', path.includes('assets') ? 'public, max-age=31536000, immutable' : 'no-cache') }));
  app.get(/^(?!\/api).*/, (req, res) => {
    if (!existsSync(join(dist, 'index.html'))) return res.status(404).send('Run: npm run build -w apps/pos');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(dist, 'index.html'));
  });
  return app;
}

// Consistent hot copy of the DB. Keeps the newest 30.
export function backup(db) {
  const dir = join(DATA, 'backups');
  const file = join(dir, `fitsecret-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  readdirSync(dir).filter((f) => f.endsWith('.db')).sort().reverse().slice(30).forEach((f) => rmSync(join(dir, f)));
  return file;
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  const db = D.openDb(join(DATA, 'fitsecret.db'));
  const invoiceOrders = () => { const b = D.getMeta(db, 'branch_id'); if (b) D.processOnlineOrders(db, b); };
  const sync = createSync(db, { afterPull: invoiceOrders });
  invoiceOrders(); // catch up on orders that arrived before this version
  const port = Number(process.env.PORT) || 4321;
  createApp(db, sync).listen(port, '0.0.0.0', () => console.log(`Fit Secrets POS → http://localhost:${port}`));
  sync.start();
  backup(db);
  setInterval(() => backup(db), 6 * 3600e3);
}
