// FitSecret POS local server. Runs on the shop PC; billing counters on the LAN open http://<pc-ip>:4321
import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLES, toWire, today, round2, ORDER_LABEL, checkStaffRow, deleteBlocker } from '@fitsecret/shared';
import { planTransfer, sellsIn } from '@fitsecret/shared/locations';
import { can, permsOf, CAPS, DOC_CAP } from '@fitsecret/shared/permissions';
import { chequeList } from '@fitsecret/shared/cheques';
const CAP_LABEL = Object.fromEntries(CAPS.flatMap(([, l]) => l.map(([k, label]) => [k, label])));
import { checkOffer } from '@fitsecret/shared/offers';
import { writeFileSync } from 'node:fs';
import { SEED_CATEGORIES, SEED_ITEMS } from '@fitsecret/shared/seed';
import { runReport, balanceSheet, checkJournal, pointsValue, dayCloseRow, REPORTS } from '@fitsecret/shared/reports';
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
  const IDLE = 12 * 3600e3; // a sign-in nobody uses for 12 hours ends
  const branch = () => D.getMeta(db, 'branch_id');

  // ---------- auth ----------
  const auth = (role) => (req, res, next) => {
    const u = sessions.get(req.get('x-token'));
    if (!u) return res.status(401).json({ error: 'Login required' });
    if (Date.now() - (u.seen || 0) > IDLE) { sessions.delete(req.get('x-token')); return res.status(401).json({ error: 'Signed out after 12 hours without use' }); }
    u.seen = Date.now();
    if (role === 'admin' && u.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    if (role && role !== 'admin' && !can(u, role)) return res.status(403).json({ error: `Not allowed for ${u.name}: ${CAP_LABEL[role] || role}. Ask the owner (Staff → Logins & PINs)` });
    // the counter was switched to a branch this person may not work at (e.g. by the owner on the same PC)
    if (u.branches && !u.branches.includes(branch()) && !req.path.endsWith('/branch/use')) { sessions.delete(req.get('x-token')); return res.status(401).json({ error: `${u.name} does not work at this branch` }); }
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

  // Before a PIN is entered only the lock screen's needs go out (anyone on the shop Wi-Fi can reach this): no bank details,
  // settings or sync account. Signed in: everything.
  app.get('/api/bootstrap', wrap((req) => (!sessions.get(req.get('x-token')) && branch() ? (() => { const b = D.getWire(db, 'branches', branch()); return {
    setup: false, branch: { id: b.id, name: b.name, code: b.code, settings: {} }, user: null, branches: [], companies: [], sync: { state: sync.status().state },
    users: db.prepare('select id, name, role, branches from users where active = 1 order by name').all().filter((u) => D.canWorkAt(u, branch())).map(({ branches, ...u }) => u),
  }; })() : {
    setup: !branch(),
    branch: branch() && D.getWire(db, 'branches', branch()),
    user: sessions.get(req.get('x-token')) || null,
    users: db.prepare('select id, name, role, branches from users where active = 1 order by name').all() // only people who work at this branch can unlock it
      .filter((u) => D.canWorkAt(u, branch())).map(({ branches, ...u }) => u),
    branches: db.prepare('select * from branches where deleted = 0').all().map((b) => toWire('branches', b)),
    companies: db.prepare('select * from companies where deleted = 0 order by created_at').all().map((c) => toWire('companies', c)),
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

  // PIN guessing: 5 wrong tries lock that login for 5 min (doubling each time, up to an hour); 15 wrong tries from one
  // device lock it too. Kept in memory: a restart clears it. ponytail: per process, enough for a counter PC.
  const fails = new Map(); // key -> { n, locks, until }
  const lockedFor = (k) => Math.ceil(((fails.get(k)?.until || 0) - Date.now()) / 60e3);
  const miss = (k, limit) => {
    const f = fails.get(k) || { n: 0, locks: 0, until: 0 };
    if (++f.n >= limit) { f.until = Date.now() + Math.min(5 * 60e3 * 2 ** f.locks, 60 * 60e3); f.locks++; f.n = 0; }
    fails.set(k, f);
    return limit - f.n;
  };
  app.post('/api/login', wrap(({ body, ip }) => {
    const owner = db.prepare("select 1 from users where id = ? and role = 'admin'").get(body.user_id);
    const keys = [['u:' + body.user_id, 5], ...(owner ? [] : [['ip:' + ip, 15]])];
    const wait = Math.max(...keys.map(([k]) => lockedFor(k)));
    if (wait > 0) throw new D.UserError(`Too many wrong PINs. Try again in ${wait} minute${wait > 1 ? 's' : ''}, or ask the owner`);
    const u = db.prepare('select * from users where id = ? and active = 1').get(body.user_id);
    if (!u || !D.checkPin(u.pin, body.pin)) {
      const left = Math.min(...keys.map(([k, n]) => miss(k, n)));
      throw new D.UserError(lockedFor('u:' + body.user_id) > 0 || lockedFor('ip:' + ip) > 0 ? 'Wrong PIN. Locked for a few minutes' : `Wrong PIN${left <= 3 ? ` · ${left} tr${left === 1 ? 'y' : 'ies'} left` : ''}`);
    }
    fails.delete('u:' + u.id);
    if (fails.get('ip:' + ip)) fails.get('ip:' + ip).n = 0;
    if (!D.canWorkAt(u, branch())) throw new D.UserError(`${u.name} does not work at ${D.get(db, 'branches', branch())?.name || 'this branch'}. Ask the owner to switch this counter`);
    const token = randomUUID(), user = { id: u.id, name: u.name, role: u.role, branches: D.userBranches(u), perms: u.role === 'admin' ? null : permsOf({ perms: D.userPerms(u) }) };
    sessions.set(token, { ...user, seen: Date.now() });
    return { token, user };
  }));
  app.post('/api/logout', (req, res) => { sessions.delete(req.get('x-token')); res.json({ ok: true }); });

  // ---------- catalogue & masters ----------
  // Only what this counter's company sells (?all=1: every item, for Items → All companies).
  app.get('/api/items', auth(), wrap(({ query, user }) => {
    const stock = D.stockMap(db, branch());
    const co = query.all ? null : D.get(db, 'branches', branch())?.company_id, cost = can(user, 'see_cost');
    // next_expiry: earliest batch still sellable (near-expiry hint, offers); expired_qty: units past expiry that must not be sold
    const t = today();
    const exp = Object.fromEntries(db.prepare(`select item_id, min(case when expiry >= ? then expiry end) e, sum(case when expiry < ? then q else 0 end) x
      from (select item_id, expiry, sum(qty) q from stock_movements where branch_id = ? and deleted = 0 and expiry is not null
            group by item_id, batch_no, expiry having sum(qty) > 0) group by item_id`).all(t, t, branch()).map((r) => [r.item_id, r]));
    return db.prepare(`select i.*, c.name category from items i left join categories c on c.id = i.category_id where i.deleted = 0 order by i.name`)
      .all().map((i) => ({ ...toWire('items', i), category: i.category, stock: stock[i.id] || 0, next_expiry: exp[i.id]?.e || null, expired_qty: round2(exp[i.id]?.x || 0) }))
      .filter((i) => sellsIn(i, co)).map((i) => (cost ? i : { ...i, purchase_price: null }));
  }));
  app.get('/api/items/:id/batches', auth(), wrap((req) => D.batches(db, branch(), req.params.id)));
  app.get('/api/items/:id/movements', auth('items'), wrap((req) => db.prepare(
    `select m.*, i.no invoice_no from stock_movements m left join invoices i on i.id = m.ref_id
     where m.item_id = ? and m.branch_id = ? and m.deleted = 0 order by m.created_at desc limit 200`).all(req.params.id, branch())));
  app.post('/api/stock/adjust', auth('stock'), wrap(({ body }) => { D.adjustStock(db, branch(), body); return { ok: true }; }));

  // Certificate PDFs / photos. Kept on this PC (served at /files/…) and, when cloud sync is set up, put in Supabase Storage so the
  // website can show them; the cloud link is returned in that case.
  const FILES = join(DATA, 'files');
  mkdirSync(FILES, { recursive: true });
  app.use('/files', express.static(FILES, { maxAge: '30d' }));
  app.post('/api/files', auth(), express.raw({ type: ['application/pdf', 'image/*'], limit: '10mb' }), wrap(async (req) => {
    const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[req.get('content-type')];
    if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) throw new D.UserError('Upload a PDF or a photo (JPG, PNG), up to 10 MB');
    const name = `${randomUUID()}.${ext}`;
    writeFileSync(join(FILES, name), req.body);
    return { url: (await sync.upload?.(name, req.body, req.get('content-type'))) || `/files/${name}` };
  }));

  app.get('/api/parties', auth(), wrap(() => {
    const bal = Object.fromEntries(R.partyBalances(db).map((b) => [b.id, b.balance]));
    return db.prepare('select * from parties where deleted = 0 order by name').all().map((p) => ({ ...toWire('parties', p), balance: bal[p.id] || 0 }));
  }));
  app.get('/api/parties/:id/ledger', auth('parties'), wrap((req) => R.ledger(db, req.params.id)));

  // who may write each table: 'admin', a permission (shared/permissions.js), or anyone signed in (null)
  const WRITABLE = { companies: 'admin', categories: 'items_edit', items: 'items_edit', parties: 'parties_edit', expenses: 'expenses', branches: 'admin', accounts: 'accounting', journals: 'accounting', coupons: 'offers', feedback: 'online',
    employees: 'staff', attendance: 'staff', certificates: 'items_edit', offers: 'offers' };
  // reading a whole table: what billing needs (items, parties, categories, coupons, offers…) is open; the rest needs its screen's permission
  const READABLE = { accounts: 'accounting', journals: 'accounting', attendance: 'staff', audit_log: 'admin', expenses: 'expenses', payments: 'payments',
    feedback: 'online', orders: 'online', order_lines: 'online', order_events: 'online', day_closes: 'dayclose', stock_movements: 'items' };
  // hidden reports feed other screens: each needs that screen's permission (a listed report also opens with 'reports')
  const REPORT_CAP = { reminders: 'payments', refills: 'parties', lapsed: 'parties', day_close: 'dayclose', insights: 'insights',
    combo_ideas: 'offers', cash_bank: 'cash', bank_statement: 'cash', staff_month: 'staff' };
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
    const need = READABLE[t];
    if (need && (need === 'admin' ? req.user.role !== 'admin' : !can(req.user, need))) throw new D.UserError(`Not allowed for ${req.user.name}: ${CAP_LABEL[need] || 'owner only'}`);
    const branchScoped = 'branch_id' in TABLES[t] && t !== 'orders';
    return db.prepare(`select * from ${t} where deleted = 0 ${branchScoped ? 'and branch_id = ?' : ''} order by created_at desc limit 1000`)
      .all(...(branchScoped ? [branch()] : [])).map((r) => toWire(t, r)).map((r) => (t === 'items' && !can(req.user, 'see_cost') ? { ...r, purchase_price: null }
        : t === 'employees' && !can(req.user, 'staff') ? { id: r.id, name: r.name, role: r.role, active: r.active, branch_id: r.branch_id } : r)); // billing's salesperson list: names only
  }));
  // One row of a master table, validated the same way for the form and for bulk import / bulk edit.
  const writeRow = (t, body, user) => {
    delete body.deleted; // deleting goes through DELETE /api/t/:table/:id (its permission and checks), never through a save
    if (t === 'items' && !can(user, 'see_cost')) delete body.purchase_price; // can't see it, so can't change it (keeps the real cost)
    // a party's money terms change what it owes and the price "usual" checks compare with: the owner's call
    if (t === 'parties' && user?.role !== 'admin') {
      const was = body.id ? D.getWire(db, 'parties', body.id) : null;
      const same = (k) => (k === 'rates' ? JSON.stringify(body[k] || {}) === JSON.stringify(was?.[k] || {}) : Number(body[k] || 0) === Number(was?.[k] || 0));
      const empty = (k) => body[k] == null || body[k] === '' || Number(body[k]) === 0 || (typeof body[k] === 'object' && !Object.keys(body[k]).length);
      for (const k of ['opening_balance', 'credit_limit', 'price_discount', 'rates']) if (k in body && !(was ? same(k) : empty(k)))
        throw new D.UserError('Only the owner can set opening balance, credit limit or special rates for a party');
    }
    if (t === 'items' && body.barcode) {
      const dup = db.prepare('select name from items where barcode = ? and id <> ? and deleted = 0').get(body.barcode, body.id || '');
      if (dup) throw new D.UserError(`Barcode already used by ${dup.name}`);
    }
    if ('branch_id' in TABLES[t] && !body.branch_id && (!body.id || !D.get(db, t, body.id))) body.branch_id = branch();
    if (t === 'expenses' && !(Number(body.amount) > 0)) throw new D.UserError('Enter an amount');
    if (t === 'expenses') body.date ||= today();
    userErr(() => checkStaffRow(t, body));
    // attendance: one row per person per day, so marking again updates that day
    if (t === 'attendance' && !body.id) body.id = db.prepare('select id from attendance where employee_id = ? and date = ? and deleted = 0').get(body.employee_id, body.date)?.id;
    if (t === 'coupons' && !body.deleted) body = userErr(() => checkCoupon({ active: true, ...(body.id && D.getWire(db, 'coupons', body.id)), ...body }, liveRows('coupons')));
    if (t === 'offers' && !body.deleted) body = userErr(() => checkOffer({ active: true, ...(body.id && D.getWire(db, 'offers', body.id)), ...body }, (id) => D.getWire(db, 'items', id), today()));
    if (t === 'certificates' && !body.deleted && (!body.id || body.url !== undefined)) {
      if (!body.item_id && !body.id) throw new D.UserError('Pick the item');
      if (!String(body.title || '').trim() && !body.id) throw new D.UserError('Give the certificate a title, e.g. “Lab test report”');
      if (!/^(https?:\/\/|\/files\/)/.test(String(body.url || ''))) throw new D.UserError('Add a link (https://…) or upload the PDF');
    }
    const isNew = !body.id || !D.get(db, t, body.id);
    if (isNew && !body.name && ['companies', 'categories', 'items', 'parties', 'branches', 'accounts', 'employees'].includes(t)) throw new D.UserError('Name required');
    if (body.name !== undefined && !String(body.name).trim() && ['companies', 'categories', 'items', 'parties', 'branches', 'accounts', 'employees'].includes(t)) throw new D.UserError('Name required');
    if (t === 'journals' && !body.deleted) {
      body.lines = userErr(() => checkJournal(body, liveRows('accounts').filter((a) => a.branch_id === branch()), D.getWire(db, 'branches', branch())?.settings));
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
    app.post(`/api/t/${t}`, auth(role), wrap(({ body, user }) => writeRow(t, body, user)));
    // Import / bulk edit: all rows or none. Errors name the row so the sheet can be fixed.
    app.post(`/api/t/${t}/bulk`, auth(t === 'parties' ? 'admin' : role), wrap(({ body, user }) => D.tx(db, () => (body.rows || []).map((r, i) => {
      try { return writeRow(t, r, user); } catch (e) { throw new D.UserError(`Row ${i + 1}${r.name ? ` (${r.name})` : ''}: ${e.message}`); }
    }))));
    app.delete(`/api/t/${t}/:id`, auth(role === 'admin' ? 'admin' : 'delete'), wrap((req) => {
      const bal = (id) => R.partyBalances(db).find((b) => b.id === id)?.balance;
      const why = deleteBlocker(t, req.params.id, liveRows, bal);
      if (why) throw new D.UserError(why);
      return D.save(db, t, { id: req.params.id, deleted: true });
    }));
  }

  // ---------- recycle bin ----------
  const TRASH = ['items', 'parties', 'categories', 'expenses', 'employees', 'accounts'];
  app.get('/api/trash', auth('admin'), wrap(() => TRASH.flatMap((t) => db.prepare(`select * from ${t} where deleted = 1 order by updated_at desc limit 300`).all()
    .map((r) => ({ table: t, id: r.id, name: r.name || `${r.category} ${r.amount}`, deleted_at: r.updated_at })))));
  app.post('/api/trash/restore', auth('admin'), wrap(({ body }) => {
    if (!TRASH.includes(body.table)) throw new D.UserError('Cannot restore that');
    return D.save(db, body.table, { id: body.id, deleted: false });
  }));

  // ---------- invoices & payments ----------
  app.post('/api/invoices', auth(), wrap(({ body, user }) => {
    if (!can(user, DOC_CAP[body.type])) throw new D.UserError(`Not allowed for ${user.name}: ${CAP_LABEL[DOC_CAP[body.type]]}`);
    checkPoints(body.party_id, (body.payments || []).filter((p) => p.mode === 'points').reduce((s, p) => s + Number(p.amount), 0));
    return D.createInvoice(db, branch(), user, body);
  }));
  // ?branch=all | <id>: the owner looks at another location's bills (or all of them) from this counter.
  app.get('/api/invoices', auth(), wrap(({ query, user }) => R.register(db, user.role === 'admin' && query.branch ? query.branch : branch(), query)));
  // Move stock between any two locations (FEFO batches, never more than the source has). See shared/locations.js.
  app.post('/api/stock/transfer', auth('transfer'), wrap(({ body }) => D.tx(db, () => {
    const t = userErr(() => planTransfer({ ...body, movements: liveRows('stock_movements'), items: liveRows('items'), branches: liveRows('branches'), today: today() }));
    for (const m of t.moves) D.save(db, 'stock_movements', m);
    return { no: t.no, ref_id: t.ref_id };
  })));
  // Which location this counter bills as (a PC at the warehouse, a laptop carried between branches).
  app.post('/api/branch/use', auth(), wrap(({ body, user }) => {
    const b = D.getWire(db, 'branches', body.id);
    if (!b || b.deleted) throw new D.UserError('Branch not found');
    // owners anywhere; a cashier only between the branches on their login (one with no list stays where the owner put the counter)
    if (user.role !== 'admin' && !user.branches?.includes(b.id)) throw new D.UserError(`${user.name} cannot work at ${b.name}`);
    D.setMeta(db, 'branch_id', b.id);
    return { ok: true };
  }));
  app.get('/api/invoices/:id', auth(), wrap((req) => {
    const inv = D.invoiceWithLines(db, req.params.id);
    if (!inv || (req.user.branches && !req.user.branches.includes(inv.branch_id))) throw new D.UserError('Not found'); // only bills of branches this login works at
    return inv;
  }));
  app.post('/api/invoices/:id/cancel', auth('cancel_bills'), wrap((req) => D.cancelInvoice(db, req.params.id, req.user, req.body?.reason)));
  app.post('/api/payments/reconcile', auth('cash'), wrap(({ body }) => D.reconcile(db, body)));
  app.post('/api/payments/:id', auth('admin'), wrap((req) => D.updatePayment(db, req.params.id, req.body, req.user)));
  app.post('/api/stock/movements/:id/undo', auth('stock'), wrap((req) => D.undoAdjustment(db, req.params.id, req.user)));
  // Day close (Z report): books vs counted; the cash difference is posted so the drawer and the books agree.
  app.post('/api/dayclose', auth('dayclose'), wrap(({ body, user }) => {
    const rep = runReport('day_close', liveRows, branch(), { date: body.date || today() });
    const { row, adjust } = userErr(() => dayCloseRow(rep, body, user));
    return D.tx(db, () => { if (adjust) D.cashAdjust(db, branch(), adjust); return D.save(db, 'day_closes', { ...row, branch_id: branch() }); });
  }));
  app.post('/api/payments', auth('payments'), wrap(({ body }) => { if (body.mode === 'points') checkPoints(body.party_id, Number(body.amount)); return D.recordPayment(db, branch(), body); }));
  app.post('/api/cash', auth('cash'), wrap(({ body }) => D.cashAdjust(db, branch(), body)));
  // Cheque register: every cheque of this branch (bounced ones too) and the deposit / clear / bounce steps.
  app.get('/api/cheques', auth('cash'), wrap(() => {
    const name = (id) => id && D.get(db, 'parties', id)?.name, no = (id) => id && D.get(db, 'invoices', id)?.no;
    return chequeList(db.prepare("select * from payments where mode = 'cheque' and branch_id = ?").all(branch()).map((r) => toWire('payments', r)), name, no, today());
  }));
  app.post('/api/cheques/:id', auth('cash'), wrap((req) => D.chequeAction(db, branch(), req.params.id, req.body, req.user)));

  // ---------- online orders ----------
  app.get('/api/orders', auth('online'), wrap(({ query }) => {
    const rows = db.prepare(`select * from orders where deleted = 0 ${query.status ? 'and status = ?' : ''} order by created_at desc limit 300`)
      .all(...(query.status ? [query.status] : []));
    const lines = db.prepare('select * from order_lines where order_id = ? and deleted = 0');
    const events = db.prepare('select status, note, created_at from order_events where order_id = ? and deleted = 0 order by created_at');
    return rows.map((o) => ({ ...toWire('orders', o), lines: lines.all(o.id), events: events.all(o.id) }));
  }));
  app.post('/api/orders/:id', auth('online'), wrap((req) => {
    if (req.body.status && !ORDER_LABEL[req.body.status]) throw new D.UserError('Bad status');
    D.updateOrder(db, req.params.id, req.body, req.user);
    D.syncOrderInvoice(db, branch(), req.params.id); // invoice / COD payment / cancellation follow the order
    return D.getWire(db, 'orders', req.params.id);
  }));
  app.post('/api/orders/:id/invoice', auth('online'), wrap((req) => D.invoiceFromOrder(db, branch(), req.user, req.params.id)));

  // ---------- reports ----------
  // money the cashier may not see (cost price, profit) is taken out of what comes back
  app.get('/api/reports/dashboard', auth('reports'), wrap(({ user }) => { const d = R.dashboard(db, branch()); if (!can(user, 'see_cost')) { d.gross_profit_month = d.net_profit_month = d.stock_value = null; } return d; }));
  app.get('/api/reports/daybook', auth('reports'), wrap(({ query }) => R.daybook(db, branch(), query.date || today())));
  app.get('/api/reports/gst', auth('reports'), wrap(({ query }) => R.gst(db, branch(), query)));
  app.get('/api/reports/stock', auth('reports'), wrap(() => R.stockSummary(db, branch())));
  app.get('/api/reports/expiry', auth('reports'), wrap(({ query }) => R.expiry(db, branch(), Number(query.days) || 60)));
  app.get('/api/reports/pnl', auth('see_cost'), wrap(({ query }) => R.pnl(db, branch(), query)));
  app.get('/api/reports/balance-sheet', auth('see_cost'), wrap(({ query }) => balanceSheet(liveRows, branch(), query.to || undefined)));
  app.get('/api/reports/x/:name', auth(), wrap((req) => {
    // the Reports screen's reports need 'reports'; owner-level ones (profit, all branches) need 'see_cost' too. Hidden ones feed other screens.
    const rep = REPORTS[req.params.name], u = req.user, need = REPORT_CAP[req.params.name];
    const ok = need ? can(u, need) || (!rep?.hidden && can(u, 'reports')) : rep?.hidden || can(u, 'reports');
    if (rep && !ok) throw new D.UserError(`Not allowed for ${u.name}: ${CAP_LABEL[need] || CAP_LABEL.reports}`);
    try { return runReport(req.params.name, liveRows, branch(), req.query, can(u, 'reports') && can(u, 'see_cost') ? 'admin' : u.role); } catch (e) { throw e.user ? new D.UserError(e.message) : e; }
  }));

  // ---------- settings ----------
  app.get('/api/users', auth('admin'), wrap(() => db.prepare('select id, name, role, active, branches, perms from users order by name').all()
    .map((u) => ({ ...u, branches: D.userBranches({ ...u, role: 'cashier' }) || [], perms: D.userPerms(u) }))));
  app.post('/api/users', auth('admin'), wrap(({ body }) => {
    const id = D.saveUser(db, body), u = db.prepare('select * from users where id = ?').get(id);
    // signed-in sessions of this person follow the change at once (taking a permission away works immediately)
    for (const [tok, s] of sessions) if (s.id === id) u.active ? sessions.set(tok, { id, name: u.name, role: u.role, branches: D.userBranches(u), perms: u.role === 'admin' ? null : permsOf({ perms: D.userPerms(u) }), seen: s.seen }) : sessions.delete(tok);
    return { id };
  }));
  app.get('/api/sync', auth(), wrap(() => sync.status()));
  app.post('/api/sync/now', auth(), wrap(async () => { await sync.run(); return sync.status(); }));
  app.post('/api/sync/config', auth('admin'), wrap(async ({ body }) => {
    if (!body.url) { await sync.configure(null); return sync.status(); }
    const prev = JSON.parse(D.getMeta(db, 'sync_config') || '{}');
    const same = body.url.trim() === prev.url && (body.email?.trim() || prev.email) === prev.email;
    await sync.configure({ url: body.url.trim(), anonKey: body.anonKey?.trim() || prev.anonKey, email: body.email?.trim() || prev.email,
      ...(body.password ? { password: body.password } : same ? { refresh: prev.refresh } : {}) }); // the password is only used to sign in
    return sync.status();
  }));
  // Other devices on the shop network: off = only this PC can open the POS (the default). Applies after a restart.
  app.get('/api/lan', auth('admin'), wrap(() => ({ on: D.getMeta(db, 'lan') === '1', listening: app.locals.host })));
  app.post('/api/lan', auth('admin'), wrap(({ body }) => { D.setMeta(db, 'lan', body.on ? '1' : null); return { on: !!body.on, listening: app.locals.host }; }));
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
  // only this PC unless the owner allows the shop network (Settings → Cloud sync & backup) or FITSECRET_LAN=1
  const host = D.getMeta(db, 'lan') === '1' || process.env.FITSECRET_LAN === '1' ? '0.0.0.0' : '127.0.0.1';
  const app = createApp(db, sync);
  app.locals.host = host;
  app.listen(port, host, () => console.log(`Fit Secrets POS → http://localhost:${port}${host === '0.0.0.0' ? ' (open to the shop network)' : ''}`));
  sync.start();
  backup(db);
  setInterval(() => backup(db), 6 * 3600e3);
}
