// Sets every item's stock in this branch to a random level between MIN and MAX (default 20-50).
// Writes normal stock movements, so the change syncs to Supabase and the website like any other stock entry.
//   node scripts/seed-stock.mjs            -> apps/pos/data/fitsecret.db
//   FITSECRET_DATA=path node scripts/seed-stock.mjs 20 50
// Safe to run while the POS is open (SQLite WAL); the running POS uploads the changes on its next sync.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import * as D from '../apps/pos/server/db.js';

const [MIN, MAX] = [Number(process.argv[2] ?? 20), Number(process.argv[3] ?? 50)];
const dir = process.env.FITSECRET_DATA || join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'pos', 'data');
const file = join(dir, 'fitsecret.db');
if (!existsSync(file)) throw new Error(`No POS database at ${file}. Run the POS setup first.`);

const db = D.openDb(file);
const branch = D.getMeta(db, 'branch_id');
if (!branch) throw new Error('POS is not set up yet (no branch).');

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const stock = D.stockMap(db, branch);
const items = db.prepare('select id from items where deleted = 0').all();
const stamp = new Date().toISOString().slice(2, 7).replace('-', ''); // e.g. 2610
let changed = 0, units = 0;

D.tx(db, () => {
  for (const { id } of items) {
    const target = rand(MIN, MAX), diff = target - (stock[id] || 0);
    if (!diff) continue;
    const expiry = new Date(Date.now() + rand(300, 720) * 864e5).toLocaleDateString('en-CA');
    D.save(db, 'stock_movements', {
      branch_id: branch, item_id: id, qty: diff, ref_type: 'adjust', note: `Bulk stock set to ${target}`,
      ...(diff > 0 ? { batch_no: `OPEN-${stamp}`, expiry } : {}),
    });
    changed++; units += target;
  }
});
console.log(`Set stock for ${changed} of ${items.length} items (${MIN}-${MAX} each, ${units} units total).`);
console.log(`${db.prepare('select count(*) n from outbox').get().n} changes queued for cloud sync.`);
